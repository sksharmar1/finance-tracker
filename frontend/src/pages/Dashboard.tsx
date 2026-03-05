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

const Dashboard: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Food');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Wait until token is present in localStorage before fetching
    const token = localStorage.getItem('token');
    if (token) {
      fetchExpenses();
    } else {
      // Poll briefly in case token is still being written
      const interval = setInterval(() => {
        const t = localStorage.getItem('token');
        if (t) {
          clearInterval(interval);
          fetchExpenses();
        }
      }, 100);
      // Stop polling after 3 seconds to avoid infinite loop
      setTimeout(() => clearInterval(interval), 3000);
    }
  }, []);

  const fetchExpenses = async () => {
    try {
      const res = await api.get('/expenses');
      setExpenses(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  // Category breakdown with animated progress bars
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
    try {
      await api.post('/expenses', { amount: parseFloat(amount), description, category });
      setAmount('');
      setDescription('');
      fetchExpenses();
    } catch (err: any) {
      setError(err.response?.data?.msg || 'Failed to add expense');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      fetchExpenses();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800">💰 My Finance Tracker</h1>
        <button onClick={handleLogout} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700">Logout</button>
      </div>

      {/* Total Spent */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-10 rounded-3xl shadow-2xl mb-10">
        <p className="text-xl opacity-90">Total Spent</p>
        <p className="text-7xl font-bold mt-2">${totalSpent.toFixed(2)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Spending by Category - Animated Progress Bars */}
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <h2 className="text-2xl font-semibold mb-6">Spending by Category</h2>
          {sortedCategories.length > 0 ? (
            <div className="space-y-6">
              {sortedCategories.map((cat, i) => {
                const percent = Math.round((cat.value / maxValue) * 100);
                return (
                  <div key={i}>
                    <div className="flex justify-between mb-2 text-sm">
                      <span className="font-medium">{cat.name}</span>
                      <span className="font-semibold">${cat.value.toFixed(2)} ({percent}%)</span>
                    </div>
                    <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-1000"
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

        {/* Recent Spending - Nice Cards */}
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <h2 className="text-2xl font-semibold mb-6">Recent Spending</h2>
          {expenses.length > 0 ? (
            <div className="space-y-4">
              {expenses.slice(0, 6).map((exp, i) => (
                <div key={exp.id} className="flex justify-between items-center bg-gray-50 p-5 rounded-2xl hover:bg-gray-100 transition-all hover:scale-[1.02]">
                  <div>
                    <p className="font-medium">{exp.description}</p>
                    <p className="text-sm text-gray-500">{new Date(exp.date).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${exp.amount.toFixed(2)}</p>
                    <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full">{exp.category}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-16">Add expenses to see recent spending</p>
          )}
        </div>
      </div>

      {/* Add Expense Form + Table */}
      <div className="bg-white rounded-3xl shadow-xl p-8 mt-8">
        <h2 className="text-2xl font-semibold mb-6">Add New Expense</h2>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input type="number" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500" required />
          <input type="text" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500" required />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="p-4 border rounded-2xl focus:ring-2 focus:ring-blue-500">
            <option value="Food">Food</option>
            <option value="Transport">Transport</option>
            <option value="Shopping">Shopping</option>
            <option value="Entertainment">Entertainment</option>
            <option value="Bills">Bills</option>
            <option value="Other">Other</option>
          </select>
          <button type="submit" className="bg-green-600 text-white font-semibold py-4 rounded-2xl hover:bg-green-700">Add Expense</button>
        </form>
      </div>

      <div className="bg-white rounded-3xl shadow-xl p-8 mt-8">
        <h2 className="text-2xl font-semibold mb-6">All Expenses ({expenses.length})</h2>
        {expenses.length === 0 ? (
          <p className="text-gray-500 py-12 text-center">No expenses yet. Add your first one above!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="py-4 text-left">Date</th>
                  <th className="py-4 text-left">Description</th>
                  <th className="py-4 text-left">Category</th>
                  <th className="py-4 text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} className="border-b hover:bg-gray-50">
                    <td className="py-5">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="py-5 font-medium">{exp.description}</td>
                    <td className="py-5"><span className="px-4 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">{exp.category}</span></td>
                    <td className="py-5 text-right font-semibold">${exp.amount.toFixed(2)}</td>
                    <td className="py-5 text-center">
                      <button onClick={() => handleDelete(exp.id)} className="text-red-500 hover:text-red-700 text-2xl">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;