/**
 * useConfig.js
 * Fetches dynamic configuration values from the backend API.
 * Replaces all hardcoded DEPARTMENTS, DESIGNATIONS, COMPANIES, CATEGORIES arrays.
 *
 * Returns live, DB-driven lists merged with sensible defaults so the UI
 * works even on a fresh database.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const CACHE_KEY = 'app_config_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Sensible UI defaults shown while loading or on error
const FALLBACK_CONFIG = {
  departments: ['General', 'Engineering', 'Marketing', 'HR', 'Finance', 'Operations', 'Sales', 'IT', 'Legal'],
  designations: ['Software Engineer', 'Senior Software Engineer', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'QA Engineer', 'Team Lead', 'Intern'],
  companies: ['Cabptiod Solutions'],
  categories: ['General', 'Technical', 'Aptitude', 'HR', 'Coding'],
  roles: ['employee', 'admin'],
  employeeStatuses: ['Active', 'Inactive'],
  questionTypes: ['mcq', 'multiple-select', 'true-false', 'coding'],
  questionDifficulties: ['easy', 'medium', 'hard'],
  assessmentStatuses: ['draft', 'active', 'scheduled', 'completed'],
};

function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL_MS) return data;
  } catch { /* ignore */ }
  return null;
}

function saveCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* ignore */ }
}

export function useConfig() {
  const [config, setConfig] = useState(() => loadCache() || FALLBACK_CONFIG);
  const [loading, setLoading] = useState(!loadCache());
  const [error, setError] = useState(null);

  const fetchConfig = useCallback(async () => {
    // Don't block if token not present (unauthenticated pages)
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get('/config');
      if (data.success && data.config) {
        setConfig(data.config);
        saveCache(data.config);
        setError(null);
      }
    } catch (err) {
      // On error, keep using fallback/cached values — don't break the UI
      console.warn('[useConfig] Failed to fetch config, using cached/fallback values:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = loadCache();
    if (cached) {
      setConfig(cached);
      setLoading(false);
      // Still refresh in the background
      fetchConfig();
    } else {
      fetchConfig();
    }
  }, [fetchConfig]);

  return { config, loading, error, refetch: fetchConfig };
}

export default useConfig;
