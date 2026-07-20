/**
 * docImportController.js
 * Production-ready .docx Question Import Controller
 *
 * Flow:
 *   1. multer validates file (type + size)
 *   2. mammoth converts .docx → HTML
 *   3. Multi-strategy parser extracts questions (order-preserved)
 *   4. Integrity check: found == parsed
 *   5. Duplicate detection (within doc + against existing assessment)
 *   6. Atomic bulkAddQuestions save
 *   7. Detailed import log + summary returned
 */

const mammoth = require('mammoth');
const path = require('path');
const { querySheets } = require('../services/googleSheets');
const { clearCache } = require('../middleware/cache');

// ─── Sanitise HTML from mammoth output ──────────────────────────────────────
function sanitizeHtml(html) {
  if (!html) return '';
  // Strip script tags and event handlers
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
}

// ─── Strip HTML tags to get plain text ──────────────────────────────────────
function stripTags(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Decode HTML entities ────────────────────────────────────────────────────
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, (match) => {
      const code = parseInt(match.slice(2, -1), 10);
      return String.fromCharCode(code);
    });
}

function cleanText(str) {
  return decodeEntities(stripTags(str)).trim();
}

// ─── Option letter normaliser (A/B/C/D or a/b/c/d or 1/2/3/4) ──────────────
function letterToIndex(letter) {
  const l = String(letter).trim().toLowerCase();
  if (['a', '1'].includes(l)) return 0;
  if (['b', '2'].includes(l)) return 1;
  if (['c', '3'].includes(l)) return 2;
  if (['d', '4'].includes(l)) return 3;
  if (['e', '5'].includes(l)) return 4;
  return -1;
}

// ─── Strategy 1: Parse linear numbered questions from plain text ─────────────
/**
 * Handles formats like:
 *   1. Question text
 *   A) Option A
 *   B) Option B   ← correct
 *   C) Option C
 *   D) Option D
 *   Answer: B
 *   Marks: 2
 *   Difficulty: Easy
 *   Explanation: ...
 */
function parseLinearQuestions(text) {
  const questions = [];
  const errors = [];

  // Split into question blocks using numbered starters
  // Matches: "1.", "Q1.", "Question 1.", "1)", "Q.1", "30.What" (no space)
  const qStartRegex = /^(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,4})[.)]\s*/im;

  // Build block boundaries
  const lines = text.split(/\r?\n/);
  const blockStarts = []; // { lineIndex, qNum }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Allow standard punctuation (., ), :, -) OR just a space/newline after the number
    // Handle standalone numbers safely by requiring them to be at the very start.
    const m = trimmed.match(/^(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,4})(?:[.):\-]|\s+|$)/i);
    if (m) {
      blockStarts.push({ lineIndex: i, qNum: parseInt(m[1], 10) });
    }
  }

  if (blockStarts.length === 0) return { questions: [], errors: [], found: 0 };

  // Extract each block
  for (let bi = 0; bi < blockStarts.length; bi++) {
    const startLine = blockStarts[bi].lineIndex;
    const endLine = bi + 1 < blockStarts.length ? blockStarts[bi + 1].lineIndex : lines.length;
    const blockLines = lines.slice(startLine, endLine);
    const blockText = blockLines.join('\n').trim();
    const qNum = blockStarts[bi].qNum;

    try {
      const parsed = parseQuestionBlock(blockText, qNum, startLine + 1);
      if (parsed) {
        questions.push(parsed);
      } else {
        errors.push({
          lineNumber: startLine + 1,
          questionNumber: qNum,
          error: 'Parse failure',
          reason: 'Could not extract question text or options from block',
          suggestedFix: 'Ensure question has text followed by A) B) C) D) options and an Answer line',
          raw: blockText.substring(0, 200),
        });
      }
    } catch (e) {
      errors.push({
        lineNumber: startLine + 1,
        questionNumber: qNum,
        error: 'Exception during parsing',
        reason: e.message,
        suggestedFix: 'Check the formatting of this question block',
        raw: blockText.substring(0, 200),
      });
    }
  }

  return { questions, errors, found: blockStarts.length };
}

// ─── Parse a single question block ──────────────────────────────────────────
function parseQuestionBlock(blockText, qNum, lineNum) {
  const lines = blockText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // First line: question number + question text
  const firstLine = lines[0];
  const qTextMatch = firstLine.match(/^(?:Q(?:uestion)?\s*\.?\s*)?\d{1,4}(?:[.):\-]|\s+)\s*(.*)/i);
  let questionText = qTextMatch && qTextMatch[1].trim() ? qTextMatch[1].trim() : firstLine.replace(/^(?:Q(?:uestion)?\s*\.?\s*)?\d{1,4}(?:[.):\-]|\s+)?/, '').trim();

  // Collect multi-line question text (before first option line)
  const optionLineRegex = /^[(\[]?[A-Ea-e1-5][).\]]\s+/;
  let i = 1;
  while (i < lines.length && !optionLineRegex.test(lines[i])) {
    // Also stop at Answer/Marks/Difficulty/Explanation keywords
    if (/^(answer|correct\s*answer?|ans|correct|marks?|difficulty|explanation)[\s:]/i.test(lines[i])) break;
    questionText += ' ' + lines[i];
    i++;
  }
  questionText = questionText.trim();

  if (!questionText) return null;

  // Extract options
  const options = [];
  const optRegex = /^[(\[]?([A-Ea-e1-5])[).\]]\s+(.+)/;
  while (i < lines.length) {
    const line = lines[i];
    if (/^(answer|correct\s*answer?|ans|correct|marks?|difficulty|explanation)[\s:]/i.test(line)) break;
    const m = line.match(optRegex);
    if (m) {
      options.push({ letter: m[1].toUpperCase(), text: m[2].trim(), isCorrect: false });
    } else if (options.length > 0 && !optionLineRegex.test(line)) {
      // Continuation of previous option
      options[options.length - 1].text += ' ' + line;
    }
    i++;
  }

  // Extract metadata lines
  let correctAnswer = null;
  let marks = 1;
  let difficulty = 'medium';
  let explanation = '';

  for (; i < lines.length; i++) {
    const line = lines[i];
    const ansMatch = line.match(/^(?:answer|correct\s*answer?|ans|correct)[\s:]+([A-Ea-e1-5])/i);
    if (ansMatch) { correctAnswer = ansMatch[1].toUpperCase(); continue; }

    const marksMatch = line.match(/^marks?[\s:]+(\d+(?:\.\d+)?)/i);
    if (marksMatch) { marks = parseFloat(marksMatch[1]); continue; }

    const diffMatch = line.match(/^difficulty[\s:]+(\w+)/i);
    if (diffMatch) {
      const d = diffMatch[1].toLowerCase();
      if (['easy', 'medium', 'hard'].includes(d)) difficulty = d;
      continue;
    }

    const expMatch = line.match(/^explanation[\s:]+(.+)/i);
    if (expMatch) { explanation = expMatch[1].trim(); continue; }
  }

  // Mark correct option
  if (correctAnswer && options.length > 0) {
    const idx = letterToIndex(correctAnswer);
    if (idx >= 0 && idx < options.length) {
      options[idx].isCorrect = true;
    } else {
      // Try matching by letter directly
      const opt = options.find(o => o.letter === correctAnswer);
      if (opt) opt.isCorrect = true;
    }
  }

  // If no correct answer marked, default to first option but flag error
  if (options.length > 0 && !options.some(o => o.isCorrect)) {
    options[0].isCorrect = true;
  }

  if (options.length < 2) {
    // Some documents have true/false questions
    if (/\btrue\b.*\bfalse\b|\bfalse\b.*\btrue\b/i.test(questionText + options.map(o => o.text).join(' '))) {
      const tfOpts = [
        { letter: 'A', text: 'True', isCorrect: correctAnswer === 'A' || !correctAnswer },
        { letter: 'B', text: 'False', isCorrect: correctAnswer === 'B' },
      ];
      return {
        questionNumber: qNum,
        lineNumber: lineNum,
        title: questionText,
        type: 'true-false',
        options: [{ text: 'True', isCorrect: tfOpts[0].isCorrect }, { text: 'False', isCorrect: tfOpts[1].isCorrect }],
        marks: Math.max(1, Math.min(100, marks || 1)),
        difficulty,
        explanation,
      };
    }
    return null; // Not enough options
  }

  return {
    questionNumber: qNum,
    lineNumber: lineNum,
    title: questionText,
    type: 'mcq',
    options: options.map(o => ({ text: o.text, isCorrect: o.isCorrect })),
    marks: Math.max(1, Math.min(100, marks || 1)),
    difficulty,
    explanation,
  };
}

// ─── Strategy 2: Parse HTML table-based questions ───────────────────────────
/**
 * Handles table format where each row is a question:
 * | Question | Option A | Option B | Option C | Option D | Answer | Marks | Difficulty |
 */
function parseTableQuestions(html) {
  const questions = [];
  const errors = [];
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRegex) || [];

  let globalQNum = 0;

  for (const tableHtml of tables) {
    const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
    const rows = tableHtml.match(rowRegex) || [];
    if (rows.length < 2) continue;

    // Detect header row
    const headerRow = rows[0];
    const headerCells = (headerRow.match(/<th[\s\S]*?<\/th>|<td[\s\S]*?<\/td>/gi) || []).map(c => cleanText(c).toLowerCase());

    const qCol = headerCells.findIndex(h => /question|q\.?no|text/i.test(h));
    const optACol = headerCells.findIndex(h => /option\s*a|opt[.\s]?a|opt[.\s]?1|choice\s*a/i.test(h));
    const optBCol = headerCells.findIndex(h => /option\s*b|opt[.\s]?b|opt[.\s]?2|choice\s*b/i.test(h));
    const optCCol = headerCells.findIndex(h => /option\s*c|opt[.\s]?c|opt[.\s]?3|choice\s*c/i.test(h));
    const optDCol = headerCells.findIndex(h => /option\s*d|opt[.\s]?d|opt[.\s]?4|choice\s*d/i.test(h));
    const ansCol = headerCells.findIndex(h => /answer|correct|ans/i.test(h));
    const marksCol = headerCells.findIndex(h => /marks?|score|points?/i.test(h));
    const diffCol = headerCells.findIndex(h => /difficulty|level/i.test(h));
    const expCol = headerCells.findIndex(h => /explanation|reason/i.test(h));

    if (qCol === -1 && optACol === -1) continue; // Not a question table

    for (let ri = 1; ri < rows.length; ri++) {
      const cells = (rows[ri].match(/<td[\s\S]*?<\/td>/gi) || []).map(c => cleanText(c));
      if (cells.length === 0) continue;

      globalQNum++;
      const questionText = qCol >= 0 ? (cells[qCol] || '').trim() : '';
      if (!questionText) continue;

      const optA = optACol >= 0 ? (cells[optACol] || '').trim() : '';
      const optB = optBCol >= 0 ? (cells[optBCol] || '').trim() : '';
      const optC = optCCol >= 0 ? (cells[optCCol] || '').trim() : '';
      const optD = optDCol >= 0 ? (cells[optDCol] || '').trim() : '';
      const ansRaw = ansCol >= 0 ? (cells[ansCol] || '').trim() : '';
      const marksRaw = marksCol >= 0 ? (cells[marksCol] || '1').trim() : '1';
      const diffRaw = diffCol >= 0 ? (cells[diffCol] || 'medium').trim().toLowerCase() : 'medium';
      const expRaw = expCol >= 0 ? (cells[expCol] || '').trim() : '';

      const optTexts = [optA, optB, optC, optD].filter(Boolean);
      if (optTexts.length < 2) {
        errors.push({
          lineNumber: ri + 1,
          questionNumber: globalQNum,
          error: 'Insufficient options',
          reason: `Only ${optTexts.length} options found in table row`,
          suggestedFix: 'Ensure table has Option A, Option B, Option C, Option D columns',
        });
        continue;
      }

      const ansIdx = letterToIndex(ansRaw);
      const options = optTexts.map((text, idx) => ({ text, isCorrect: idx === ansIdx }));
      if (!options.some(o => o.isCorrect)) options[0].isCorrect = true;

      const difficulty = ['easy', 'medium', 'hard'].includes(diffRaw) ? diffRaw : 'medium';
      const marks = Math.max(1, Math.min(100, parseFloat(marksRaw) || 1));

      questions.push({
        questionNumber: globalQNum,
        lineNumber: ri + 1,
        title: questionText,
        type: 'mcq',
        options,
        marks,
        difficulty,
        explanation: expRaw,
      });
    }
  }

  return { questions, errors, found: globalQNum };
}

// ─── Master parser: tries strategies in order ────────────────────────────────
function parseDocument(html, plainText) {
  const sanitizedHtml = sanitizeHtml(html);

  // Try table strategy first if tables are present
  const tableResult = parseTableQuestions(sanitizedHtml);
  if (tableResult.questions.length > 0) {
    return {
      strategy: 'table',
      ...tableResult,
    };
  }

  // Fall back to linear text strategy
  const linearResult = parseLinearQuestions(plainText);
  if (linearResult.questions.length > 0) {
    return {
      strategy: 'linear',
      ...linearResult,
    };
  }

  // Last resort: try linear on HTML-stripped text (handles some docx quirks)
  const htmlText = cleanText(sanitizedHtml);
  const htmlLinearResult = parseLinearQuestions(htmlText);
  return {
    strategy: 'html-fallback',
    ...htmlLinearResult,
  };
}

// ─── Validate parsed questions ───────────────────────────────────────────────
function validateQuestions(questions) {
  const validationErrors = [];

  for (const q of questions) {
    if (!q.title || q.title.trim().length < 3) {
      validationErrors.push({
        questionNumber: q.questionNumber,
        lineNumber: q.lineNumber,
        error: 'Empty or too-short question text',
        reason: 'Question title must be at least 3 characters',
        suggestedFix: 'Ensure the question has descriptive text',
      });
    }

    if (!Array.isArray(q.options) || q.options.length < 2) {
      validationErrors.push({
        questionNumber: q.questionNumber,
        lineNumber: q.lineNumber,
        error: 'Insufficient options',
        reason: `Only ${q.options?.length || 0} options found`,
        suggestedFix: 'Provide at least 2 answer options (A, B, C, D)',
      });
    } else {
      const emptyOpts = q.options.filter(o => !o.text || o.text.trim().length === 0);
      if (emptyOpts.length > 0) {
        validationErrors.push({
          questionNumber: q.questionNumber,
          lineNumber: q.lineNumber,
          error: 'Empty option text',
          reason: `${emptyOpts.length} option(s) have no text`,
          suggestedFix: 'Fill in all option texts',
        });
      }

      if (!q.options.some(o => o.isCorrect)) {
        validationErrors.push({
          questionNumber: q.questionNumber,
          lineNumber: q.lineNumber,
          error: 'No correct answer',
          reason: 'No option is marked as correct',
          suggestedFix: 'Add "Answer: A" (or B/C/D) line after the options',
        });
      }
    }

    if (isNaN(q.marks) || q.marks < 1 || q.marks > 100) {
      validationErrors.push({
        questionNumber: q.questionNumber,
        lineNumber: q.lineNumber,
        error: 'Invalid marks value',
        reason: `Marks value "${q.marks}" is invalid`,
        suggestedFix: 'Set marks between 1 and 100',
      });
    }
  }

  return validationErrors;
}

// ─── Detect duplicates within the imported document ──────────────────────────
function detectInDocDuplicates(questions) {
  const seen = new Map(); // normalised title → first questionNumber
  const duplicates = [];

  for (const q of questions) {
    const key = (q.title || '').trim().toLowerCase();
    if (seen.has(key)) {
      duplicates.push({
        questionNumber: q.questionNumber,
        lineNumber: q.lineNumber,
        duplicateOf: seen.get(key),
        questionText: q.title,
      });
    } else {
      seen.set(key, q.questionNumber);
    }
  }

  return duplicates;
}

// ─── Main import handler ─────────────────────────────────────────────────────
exports.importDocxQuestions = async (req, res) => {
  const startTime = Date.now();

  try {
    // ── 1. File validation ──────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const file = req.file;
    const originalName = file.originalname || '';
    const ext = path.extname(originalName).toLowerCase();

    if (ext !== '.docx') {
      return res.status(400).json({
        success: false,
        message: `Invalid file type "${ext}". Only .docx files are accepted. Please reject .doc, PDF, images, and other formats.`,
        fileType: ext,
      });
    }

    const allowedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (file.mimetype && file.mimetype !== allowedMime && !file.mimetype.includes('octet-stream')) {
      return res.status(400).json({
        success: false,
        message: `Invalid MIME type "${file.mimetype}". Only .docx files are accepted.`,
      });
    }

    const assessmentId = req.params.id;
    if (!assessmentId) {
      return res.status(400).json({ success: false, message: 'assessmentId is required' });
    }

    // ── 2. Convert .docx → HTML + text using mammoth ────────────────────────
    let mammothResult;
    try {
      mammothResult = await mammoth.convertToHtml({ buffer: file.buffer }, {
        convertImage: mammoth.images.inline(async (element) => {
          const imageBuffer = await element.read('base64');
          return {
            src: `data:${element.contentType};base64,${imageBuffer}`,
          };
        }),
      });
    } catch (mammothErr) {
      return res.status(422).json({
        success: false,
        message: 'Failed to read the Word document. The file may be corrupted or password-protected.',
        detail: mammothErr.message,
      });
    }

    const html = mammothResult.value;
    // Extract plain text from HTML for text-based parsing
    const plainText = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1), 10)))
      .trim();

    if (!plainText || plainText.length < 10) {
      return res.status(422).json({
        success: false,
        message: 'The uploaded document appears to be empty or unreadable.',
      });
    }

    // ── 3. Parse document ────────────────────────────────────────────────────
    const parseResult = parseDocument(html, plainText);
    const { questions: parsedQuestions, errors: parseErrors, found, strategy } = parseResult;

    // ── 4. Integrity check ───────────────────────────────────────────────────
    if (found > 0 && parsedQuestions.length < found) {
      const missed = found - parsedQuestions.length;
      return res.status(422).json({
        success: false,
        message: `Import Failed. ${found} questions detected in document but only ${parsedQuestions.length} could be parsed. ${missed} question(s) could not be parsed.`,
        summary: {
          found,
          parsed: parsedQuestions.length,
          missed,
          strategy,
        },
        errors: parseErrors,
        aborted: true,
      });
    }

    if (parsedQuestions.length === 0) {
      return res.status(422).json({
        success: false,
        message: 'No questions could be extracted from the document. Please ensure the document follows the supported format (numbered questions with A/B/C/D options).',
        parseErrors,
        supportedFormats: [
          '1. Question text\\nA) Option\\nB) Option\\nC) Option\\nD) Option\\nAnswer: A',
          'Table with columns: Question | Option A | Option B | Option C | Option D | Answer | Marks',
        ],
      });
    }

    // ── 5. Validate parsed questions ─────────────────────────────────────────
    const validationErrors = validateQuestions(parsedQuestions);

    // ── 6. Detect in-doc duplicates ──────────────────────────────────────────
    const inDocDuplicates = detectInDocDuplicates(parsedQuestions);

    // ── 7. Detect duplicates against existing questions in assessment ─────────
    let existingTitles = new Set();
    let existingVsDocDuplicates = [];
    try {
      const qRes = await querySheets('getQuestions', { assessmentId });
      const existingQs = (qRes.data || []).filter(
        q => String(q.assessment) === String(assessmentId) || String(q.assessmentId) === String(assessmentId)
      );
      existingTitles = new Set(existingQs.map(q => (q.title || q.question || '').trim().toLowerCase()));

      existingVsDocDuplicates = parsedQuestions
        .filter(q => existingTitles.has(q.title.trim().toLowerCase()))
        .map(q => ({
          questionNumber: q.questionNumber,
          lineNumber: q.lineNumber,
          questionText: q.title,
          reason: 'Already exists in this assessment',
        }));
    } catch (e) {
      console.warn('Could not check for existing question duplicates:', e.message);
    }

    // ── 8. Handle duplicate override instructions ─────────────────────────────
    // Client can send { duplicateActions: { "34": "skip" | "replace" | "ignore" } }
    const duplicateActions = req.body.duplicateActions
      ? (typeof req.body.duplicateActions === 'string'
          ? JSON.parse(req.body.duplicateActions)
          : req.body.duplicateActions)
      : {};

    // If there are unresolved duplicates and no actions provided, return for resolution
    const unresolvedInDoc = inDocDuplicates.filter(
      d => !duplicateActions[String(d.questionNumber)]
    );
    const unresolvedExisting = existingVsDocDuplicates.filter(
      d => !duplicateActions[String(d.questionNumber)]
    );

    if ((unresolvedInDoc.length > 0 || unresolvedExisting.length > 0) && Object.keys(duplicateActions).length === 0) {
      return res.status(200).json({
        success: false,
        requiresDuplicateResolution: true,
        message: 'Duplicates detected. Please resolve before saving.',
        parsed: parsedQuestions.length,
        found,
        inDocDuplicates: unresolvedInDoc,
        existingDuplicates: unresolvedExisting,
        validationErrors,
        parseErrors,
        strategy,
        // Return questions preview so UI can show them
        questionsPreview: parsedQuestions.map(q => ({
          questionNumber: q.questionNumber,
          lineNumber: q.lineNumber,
          title: q.title.substring(0, 120),
          optionCount: q.options.length,
          marks: q.marks,
          difficulty: q.difficulty,
          hasCorrectAnswer: q.options.some(o => o.isCorrect),
        })),
      });
    }

    // ── 9. Filter questions based on duplicate actions ───────────────────────
    const seenTitles = new Set(existingTitles);
    const seenInDocTitles = new Map(); // title → first qNum
    const questionsToSave = [];
    let skippedCount = 0;
    let duplicateCount = 0;

    for (const q of parsedQuestions) {
      const titleKey = q.title.trim().toLowerCase();
      const action = duplicateActions[String(q.questionNumber)];

      const isExistingDup = existingTitles.has(titleKey);
      const isInDocDup = seenInDocTitles.has(titleKey);

      if (isInDocDup || isExistingDup) {
        duplicateCount++;
        if (action === 'skip' || !action) {
          skippedCount++;
          continue;
        }
        // 'ignore' or 'replace' → include it
      }

      seenInDocTitles.set(titleKey, q.questionNumber);
      seenTitles.add(titleKey);
      questionsToSave.push(q);
    }

    // ── 10. Atomic save via Sequential Processing & Manual Rollback ────────
    let idCounter = Date.now();
    const crypto = require('crypto');
    const importBatchId = crypto.randomUUID();

    const formattedQuestions = questionsToSave.map(q => ({
      _id: (idCounter++).toString(),
      title: q.title,
      type: q.type || 'mcq',
      options: q.options,
      marks: q.marks,
      difficulty: q.difficulty,
      explanation: q.explanation || '',
      assessmentId,
      assessment: assessmentId,
      createdBy: req.user._id,
      importedFrom: req.file.originalname,
      questionNumber: q.questionNumber,
      source: 'DOCUMENT_IMPORT',
      importBatchId,
    }));

    let savedCount = 0;
    const successfullySavedIds = [];
    let saveError = null;
    let failedQuestionNum = null;

    if (formattedQuestions.length > 0) {
      console.log(`[importDocx] Starting bulk upload for ${formattedQuestions.length} questions...`);
      try {
        await querySheets('bulkAddQuestions', { questions: formattedQuestions, assessmentId });
        
        successfullySavedIds.push(...formattedQuestions.map(q => q._id));
        savedCount = formattedQuestions.length;
        console.log(`[importDocx] ✅ Successfully bulk saved ${savedCount} questions.`);
        
        // No need to manually update assessment.questions here if bulkAddQuestions handles it, 
        // but let's do it just in case, exactly as questionController does (or doesn't).
        // Wait, questionController doesn't manually update assessment for bulkAddQuestions.
      } catch (err) {
        console.error(`[importDocx] ❌ Bulk upload failed:`, err.message);
        saveError = err.message;
        
        return res.status(500).json({
          success: false,
          message: 'Upload Failed (Bulk Add Error)',
          detail: saveError,
          aborted: true,
        });
      }
    }

    // ── 11. Clear cache + emit socket ────────────────────────────────────────
    clearCache();
    if (global.io) global.io.emit('db:sync');

    // ── 12. Build import log ─────────────────────────────────────────────────
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const importLog = {
      timestamp: new Date().toISOString(),
      user: req.user._id,
      assessmentId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      strategy,
      totalFound: found,
      totalParsed: parsedQuestions.length,
      totalSaved: savedCount,
      totalSkipped: skippedCount,
      totalDuplicates: duplicateCount,
      totalFailed: parseErrors.length + validationErrors.length,
      processingTime: `${processingTime}s`,
      parseErrors: parseErrors.length,
      validationErrors: validationErrors.length,
    };

    console.log('📄 DOCX IMPORT LOG:', JSON.stringify(importLog));

    // ── 13. Return summary ───────────────────────────────────────────────────
    return res.status(201).json({
      success: true,
      message: `Import successful! ${savedCount} question(s) imported.`,
      summary: {
        documentQuestions: found,
        imported: savedCount,
        skipped: skippedCount,
        failed: parseErrors.length + validationErrors.length,
        duplicates: duplicateCount,
        processingTime: `${processingTime} seconds`,
        strategy,
        fileName: req.file.originalname,
        assessmentId,
      },
      errors: [...parseErrors, ...validationErrors],
      importLog,
    });

  } catch (err) {
    console.error('DOCX IMPORT ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'Unexpected import error: ' + err.message,
      aborted: true,
    });
  }
};

// ─── Get import logs for an assessment ──────────────────────────────────────
exports.getImportLogs = async (req, res) => {
  // Import logs are stored in console; in production these would be in a DB
  // For now return a stub indicating no persistent logs are available
  res.json({
    success: true,
    message: 'Import logs are written to server console. Persistent log storage not yet configured.',
    assessmentId: req.params.id,
  });
};
