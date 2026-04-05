const SUPABASE_URL = 'https://strmnfwpdtdnevhpqtar.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cm1uZndwZHRkbmV2aHBxdGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjMzNTYsImV4cCI6MjA5MDczOTM1Nn0.huQeZ4xg1K0qJKrW75ZktTkeEmPFE9QrKFdp8idLZj8';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
