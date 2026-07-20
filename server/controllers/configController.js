/**
 * configController.js
 * Serves dynamic configuration values derived from live database data.
 * Replaces hardcoded frontend constants with DB-driven values.
 */
const { querySheets } = require('../services/googleSheets');

// True domain enumerations — these are fixed by the business domain, not mock data
const QUESTION_TYPES = ['mcq', 'multiple-select', 'true-false', 'coding'];
const QUESTION_DIFFICULTIES = ['easy', 'medium', 'hard'];
const ASSESSMENT_STATUSES = ['draft', 'active', 'scheduled', 'completed'];
const EMPLOYEE_ROLES = ['employee', 'admin'];
const EMPLOYEE_STATUSES = ['Active', 'Inactive'];

/**
 * GET /api/config
 * Returns all dynamic configuration values derived from live data.
 * - departments: unique departments from employees collection
 * - categories: unique categories from assessments collection
 * - designations: unique designations from employees collection
 * - companies: unique companies from employees collection
 * - Plus static domain enumerations (roles, statuses, question types, difficulties)
 */
exports.getConfig = async (req, res) => {
  try {
    const [empRes, assRes] = await Promise.all([
      querySheets('getEmployees'),
      querySheets('getAssessments'),
    ]);

    const employees = empRes.data || [];
    const assessments = assRes.data || [];

    // Derive departments from actual employee data
    const departments = [
      ...new Set(
        employees
          .map(e => (e.department || '').trim())
          .filter(Boolean)
      ),
    ].sort();

    // Ensure sensible defaults exist even on a fresh database
    const defaultDepartments = ['General', 'Engineering', 'Marketing', 'HR', 'Finance', 'Operations', 'Sales', 'IT', 'Legal'];
    const allDepartments = [...new Set([...defaultDepartments, ...departments])].sort();

    // Derive designations from actual employee data
    const designations = [
      ...new Set(
        employees
          .map(e => (e.designation || '').trim())
          .filter(Boolean)
      ),
    ].sort();

    const defaultDesignations = [
      'Software Engineer', 'Senior Software Engineer', 'Full Stack Developer',
      'Frontend Developer', 'Backend Developer', 'QA Engineer', 'DevOps Engineer',
      'Data Analyst', 'Project Manager', 'UI/UX Designer', 'Business Analyst',
      'HR Executive', 'Accountant', 'Sales Executive', 'Team Lead', 'Intern',
      'Digital Marketing',
    ];
    const allDesignations = [...new Set([...defaultDesignations, ...designations])].sort();

    // Derive companies from actual employee data
    const companies = [
      ...new Set(
        employees
          .map(e => (e.company || '').trim())
          .filter(Boolean)
      ),
    ].sort();

    const defaultCompanies = ['Cabptiod Solutions'];
    const allCompanies = [...new Set([...defaultCompanies, ...companies])].sort();

    // Derive assessment categories from actual assessments
    const categories = [
      ...new Set(
        assessments
          .map(a => (a.category || '').trim())
          .filter(Boolean)
      ),
    ].sort();

    const defaultCategories = ['General', 'Technical', 'Aptitude', 'HR', 'Coding'];
    const allCategories = [...new Set([...defaultCategories, ...categories])].sort();

    res.json({
      success: true,
      config: {
        // Dynamic — derived from live DB data
        departments: allDepartments,
        designations: allDesignations,
        companies: allCompanies,
        categories: allCategories,

        // Domain enumerations — fixed by business rules, not mock data
        roles: EMPLOYEE_ROLES,
        employeeStatuses: EMPLOYEE_STATUSES,
        questionTypes: QUESTION_TYPES,
        questionDifficulties: QUESTION_DIFFICULTIES,
        assessmentStatuses: ASSESSMENT_STATUSES,
      },
    });
  } catch (err) {
    console.error('[getConfig] error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
