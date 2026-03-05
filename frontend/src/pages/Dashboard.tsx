import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

interface Expense {
  id: number;
  amount: number;
  description: string;
  category: string;
  date: string;
}

// ── Skeleton pulse block ──────────────────────────────────────────
const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />
);

// ── Category colors ───────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Food:          'bg-emerald-100 text-emerald-700',
  Transport:     'bg-blue-100 text-blue-700',
  Shopping:      'bg-pink-100 text-pink-700',
  Entertainment: 'bg-violet-100 text-violet-700',
  Bills:         'bg-orange-100 text-orange-700',
  Other:         'bg-gray-100 text-gray-600',
};

const BAR_COLORS: Record<string, string> = {
  Food:          'from-emerald-400 to-emerald-600',
  Transport:     'from-blue-400 to-blue-600',
  Shopping:      'from-pink-400 to-pink-600',
  Entertainment: 'from-violet-400 to-violet-600',
  Bills:         'from-orange-400 to-orange-600',
  Other:         'from-gray-300 to-gray-500',
};

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Other'];

// ── Simple keyword-based ML category suggestion ───────────────────
const suggestCategory = (desc: string): string => {
  const d = desc.toLowerCase();
  if (/coffee|cafe|restaurant|lunch|dinner|breakfast|food|pizza|burger|sushi|grocery|supermarket|milk|bread|cereal/.test(d)) return 'Food';
  if (/uber|lyft|taxi|bus|train|metro|gas|fuel|parking|transport|flight|airport/.test(d)) return 'Transport';
  if (/amazon|shop|mall|clothes|shoes|shirt|dress|nike|zara|h&m|purchase|order/.test(d)) return 'Shopping';
  if (/netflix|spotify|movie|cinema|concert|game|steam|hulu|disney|ticket|entertainment/.test(d)) return 'Entertainment';
  if (/rent|electricity|water|internet|phone|insurance|bill|utility|subscription/.test(d)) return 'Bills';
  return 'Other';
};

const Dashboard: React.FC = () => {
  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [amount, setAmount]           = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]       = useState('Food');
  const [suggested, setSuggested]     = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(true);
  const [adding, setAdding]           = useState(false);
  const [deletingId, setDeletingId]   = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchExpenses();
    } else {
      const interval = setInterval(() => {
        const t = localStorage.getItem('token');
        if (t) { clearInterval(interval); fetchExpenses(); }
      }, 100);
      setTimeout(() => clearInterval(interval), 3000);
    }
  }, []);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/expenses');
      setExpenses(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-suggest category as user types description
  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    if (val.length > 2) {
      const suggestion = suggestCategory(val);
      setSuggested(suggestion);
      setCategory(suggestion);
    } else {
      setSuggested('');
    }
  };

  const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  const categoryMap = expenses.reduce((acc: Record<string, number>, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
    return acc;
  }, {});

  const sortedCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const maxValue = Math.max(...sortedCategories.map(c => c.value), 1);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;
    setAdding(true);
    setError('');
    try {
      await api.post('/expenses', { amount: parseFloat(amount), description, category });
      setAmount('');
      setDescription('');
      setSuggested('');
      setCategory('Food');
      await fetchExpenses();
    } catch (err: any) {
      setError(err.response?.data?.msg || 'Failed to add expense');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this expense?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/expenses/${id}`);
      await fetchExpenses();
    } catch {
      alert('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky Nav ───────────────────────────────────── */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-800">💰 My Finance Tracker</h1>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-red-700 text-sm sm:text-base"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">

        {/* ── Total Spent — blue-purple theme ──────────────── */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-8 sm:p-10 rounded-3xl shadow-2xl relative overflow-hidden">
          {/* Decorative bubbles */}
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white opacity-5 rounded-full" />
          <div className="absolute -bottom-10 -left-6 w-56 h-56 bg-white opacity-5 rounded-full" />
          <div className="absolute top-4 right-32 w-20 h-20 bg-white opacity-5 rounded-full" />
          <div className="absolute bottom-4 right-8 w-12 h-12 bg-white opacity-5 rounded-full" />
          {/* Floating dollar symbols */}
          <span className="absolute top-5 right-10 text-4xl opacity-10 select-none">$</span>
          <span className="absolute top-12 right-28 text-2xl opacity-10 select-none">$</span>
          <span className="absolute bottom-6 right-20 text-5xl opacity-10 select-none">$</span>
          <span className="absolute bottom-8 left-10 text-3xl opacity-10 select-none">$</span>
          <p className="text-base sm:text-xl opacity-90 relative z-10">Total Spent</p>
          {loading ? (
            <Skeleton className="h-14 w-40 mt-2 bg-white/20" />
          ) : (
            <p className="text-5xl sm:text-7xl font-bold mt-2 relative z-10">${totalSpent.toFixed(2)}</p>
          )}
          <p className="mt-2 text-sm opacity-60 relative z-10">{expenses.length} transactions</p>
        </div>

        {/* ── Category + Recent ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">

          {/* Spending by Category */}
          <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-semibold mb-6">Spending by Category</h2>
            {loading ? (
              <div className="space-y-6">
                {[1, 2, 3].map(i => (
                  <div key={i}>
                    <div className="flex justify-between mb-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : sortedCategories.length > 0 ? (
              <div className="space-y-5">
                {sortedCategories.map((cat, i) => {
                  const percent = Math.round((cat.value / maxValue) * 100);
                  const barColor = BAR_COLORS[cat.name] || 'from-gray-300 to-gray-500';
                  const tagColor = CATEGORY_COLORS[cat.name] || CATEGORY_COLORS.Other;
                  return (
                    <div key={i}>
                      <div className="flex justify-between mb-2 text-sm">
                        <span className={`font-semibold px-2.5 py-0.5 rounded-full text-xs ${tagColor}`}>{cat.name}</span>
                        <span className="font-semibold text-gray-600">${cat.value.toFixed(2)} ({percent}%)</span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${barColor} transition-all duration-1000 rounded-full`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-16">Add expenses to see breakdown</p>
            )}
          </div>

          {/* Recent Spending */}
          <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-semibold mb-6">Recent Spending</h2>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : expenses.length > 0 ? (
              <div className="space-y-4">
                {expenses.slice(0, 6).map((exp) => {
                  const tagColor = CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.Other;
                  return (
                    <div key={exp.id} className="flex justify-between items-center bg-gray-50 p-4 sm:p-5 rounded-2xl hover:bg-gray-100 transition-all hover:scale-[1.02]">
                      <div className="min-w-0 mr-3">
                        <p className="font-medium truncate">{exp.description}</p>
                        <p className="text-sm text-gray-500">{new Date(exp.date).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xl sm:text-2xl font-bold">${exp.amount.toFixed(2)}</p>
                        <span className={`text-xs font-medium px-3 py-1 rounded-full ${tagColor}`}>{exp.category}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-16">Add expenses to see recent spending</p>
            )}
          </div>
        </div>

        {/* ── Add Expense Form ─────────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-semibold mb-2">Add New Expense</h2>
          <p className="text-sm text-gray-400 mb-6">Category is auto-suggested as you type ✨</p>
          {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
          <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <input
              type="number" step="0.01" placeholder="Amount"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              className="p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm sm:text-base"
              required
            />
            <div className="relative">
              <input
                type="text" placeholder="Description (ML will suggest category)"
                value={description} onChange={(e) => handleDescriptionChange(e.target.value)}
                className="w-full p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm sm:text-base"
                required
              />
              {suggested && (
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[suggested]}`}>
                  ✨ {suggested}
                </span>
              )}
            </div>
            <select
              value={category} onChange={(e) => setCategory(e.target.value)}
              className="p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-sm sm:text-base"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              type="submit"
              disabled={adding}
              className="bg-green-600 text-white font-semibold py-4 rounded-2xl hover:bg-green-700 flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
            >
              {adding ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Adding...
                </>
              ) : 'Add Expense'}
            </button>
          </form>
        </div>

        {/* ── All Expenses Table ───────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-semibold mb-6">All Expenses ({expenses.length})</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex justify-between items-center py-4 border-b border-gray-50">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-gray-500 py-12 text-center">No expenses yet. Add your first one above!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-4 text-left text-sm sm:text-base">Date</th>
                    <th className="py-4 text-left text-sm sm:text-base">Description</th>
                    <th className="py-4 text-left text-sm sm:text-base">Category</th>
                    <th className="py-4 text-right text-sm sm:text-base">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => {
                    const tagColor = CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.Other;
                    return (
                      <tr key={exp.id} className="border-b hover:bg-gray-50">
                        <td className="py-4 text-sm text-gray-500">{new Date(exp.date).toLocaleDateString()}</td>
                        <td className="py-4 font-medium text-sm sm:text-base">{exp.description}</td>
                        <td className="py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${tagColor}`}>{exp.category}</span>
                        </td>
                        <td className="py-4 text-right font-semibold text-sm sm:text-base">${exp.amount.toFixed(2)}</td>
                        <td className="py-4 text-center">
                          {deletingId === exp.id ? (
                            <svg className="animate-spin h-4 w-4 mx-auto text-gray-400" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                          ) : (
                            <button onClick={() => handleDelete(exp.id)} className="text-red-500 hover:text-red-700 text-xl sm:text-2xl">🗑</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
