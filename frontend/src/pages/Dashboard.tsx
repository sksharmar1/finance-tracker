import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

interface Expense {
  id: number;
  amount: number;
  description: string;
  category: string;
  date: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Gift Cards', 'Other'];

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#f97316',
  Transport: '#3b82f6',
  Shopping: '#a855f7',
  Entertainment: '#ec4899',
  Bills: '#ef4444',
  'Gift Cards': '#10b981',
  Other: '#6b7280',
};

const Dashboard: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Food');
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [isPredicting, setIsPredicting] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [feedbackPredicted, setFeedbackPredicted] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'monthly' | 'expenses'>('overview');
  const [username, setUsername] = useState('');

  // Chatbot state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hi! I'm your finance assistant 💰 Ask me anything about budgeting, spending habits, or saving tips!" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();

  useEffect(() => {
    // Decode username from JWT payload (no extra API call needed)
    try {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/'); return; }
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Flask-JWT stores username in 'sub' as user id; fetch profile or use stored name
      // We store username separately at login time via localStorage
      const storedName = localStorage.getItem('username');
      if (storedName) setUsername(storedName);
    } catch {}
    fetchExpenses();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchExpenses = async () => {
    try {
      const res = await api.get('/expenses');
      setExpenses(res.data || []);
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 422) {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        navigate('/');
      } else {
        console.error(err);
      }
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

  // Monthly summary
  const monthlySummary = expenses.reduce((acc: Record<string, number>, exp) => {
    const month = new Date(exp.date).toLocaleString('default', { month: 'short', year: '2-digit' });
    acc[month] = (acc[month] || 0) + exp.amount;
    return acc;
  }, {});

  const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlyEntries = Object.entries(monthlySummary).sort((a, b) => {
    const [am, ay] = a[0].split(' ');
    const [bm, by] = b[0].split(' ');
    if (ay !== by) return parseInt(ay) - parseInt(by);
    return MONTH_ORDER.indexOf(am) - MONTH_ORDER.indexOf(bm);
  });

  const maxMonthlyValue = Math.max(...monthlyEntries.map(([, v]) => v), 1);

  const currentMonth = new Date().toLocaleString('default', { month: 'short', year: '2-digit' });
  const currentMonthSpend = monthlySummary[currentMonth] || 0;
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toLocaleString('default', { month: 'short', year: '2-digit' });
  const lastMonthSpend = monthlySummary[lastMonth] || 0;
  const monthOverMonth = lastMonthSpend > 0
    ? ((currentMonthSpend - lastMonthSpend) / lastMonthSpend * 100).toFixed(1)
    : null;

  const exportCSV = () => {
    const header = 'Date,Description,Category,Amount\n';
    const rows = expenses.map(e =>
      `${new Date(e.date).toLocaleDateString()},"${e.description}",${e.category},${e.amount.toFixed(2)}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported to CSV!', 'success');
  };

  // Debounced ML Prediction
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (description.trim().length >= 3) {
        setIsPredicting(true);
        try {
          const res = await api.post('/predict-category', { description });
          if (res.data && res.data.category) {
            setSuggestedCategory(res.data.category);
            setConfidence(Math.round((res.data.confidence || 0) * 100));
          }
        } catch (err: any) {
          console.error('Prediction error:', err?.response?.data || err?.message || err);
          setSuggestedCategory('');
          setConfidence(0);
        } finally {
          setIsPredicting(false);
        }
      } else {
        setSuggestedCategory('');
        setConfidence(0);
        setIsPredicting(false);
      }
    }, 450);
    return () => clearTimeout(timeout);
  }, [description]);

  const useSuggestion = () => {
    if (suggestedCategory) {
      setCategory(suggestedCategory);
      setSuggestedCategory('');
      setConfidence(0);
    }
  };

  const submitFeedback = async (correctCategory: string) => {
    if (!feedbackDescription || !feedbackPredicted) return;
    try {
      await api.post('/feedback', { description: feedbackDescription, predicted: feedbackPredicted, actual: correctCategory });
      showToast(`Feedback saved: "${feedbackDescription}" → ${correctCategory}`, 'success');
      setCategory(correctCategory);
      setSuggestedCategory('');
      setConfidence(0);
    } catch {
      showToast('Failed to save feedback', 'error');
    }
    setShowFeedbackModal(false);
    setFeedbackDescription('');
    setFeedbackPredicted('');
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;
    try {
      await api.post('/expenses', { amount: parseFloat(amount), description, category });
      setAmount('');
      setDescription('');
      setSuggestedCategory('');
      setConfidence(0);
      fetchExpenses();
      showToast('Expense added!', 'success');
    } catch {
      showToast('Failed to add expense', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      fetchExpenses();
      showToast('Expense deleted', 'success');
    } catch {
      showToast('Failed to delete expense', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    navigate('/');
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);

    const spendingSummary = `User has ${expenses.length} expenses totaling $${totalSpent.toFixed(2)}. Top categories: ${sortedCategories.slice(0, 3).map(c => `${c.name}: $${c.value.toFixed(2)}`).join(', ')}. This month: $${currentMonthSpend.toFixed(2)}.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a helpful personal finance assistant. Be concise, friendly, and give practical advice. User spending context: ${spendingSummary} Keep responses under 120 words.`,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await response.json();
      const reply = data.content?.find((b: any) => b.type === 'text')?.text || "Sorry, couldn't respond right now.";
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .dash-root {
          font-family: 'Plus Jakarta Sans', sans-serif;
          background: #f0f2f8;
          min-height: 100vh;
          color: #1e1e2e;
        }

        /* ── HERO ── */
        .hero {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #1a1060 0%, #2d1b8e 40%, #1e0f6e 70%, #160e55 100%);
          border-radius: 28px;
          padding: 48px 52px;
          margin-bottom: 24px;
        }

        /* subtle noise texture overlay */
        .hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          border-radius: 28px;
        }

        .hero-glow-a {
          position: absolute; width: 460px; height: 460px; border-radius: 50%;
          background: radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 65%);
          top: -140px; right: -60px; pointer-events: none;
        }
        .hero-glow-b {
          position: absolute; width: 320px; height: 320px; border-radius: 50%;
          background: radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 65%);
          bottom: -80px; left: 30%; pointer-events: none;
        }

        .dollar-bubble {
          position: absolute;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Outfit', sans-serif;
          font-weight: 700;
          color: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.03);
          pointer-events: none;
          user-select: none;
          animation: floatBubble ease-in-out infinite;
        }

        @keyframes floatBubble {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }

        .hero-content { position: relative; z-index: 1; }

        .hero-label {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: rgba(255,255,255,0.45);
          margin-bottom: 10px;
        }

        .total-amount {
          font-family: 'Outfit', sans-serif;
          font-weight: 800;
          font-size: clamp(3.2rem, 6vw, 5rem);
          color: #ffffff;
          letter-spacing: -0.02em;
          line-height: 1;
          margin-bottom: 32px;
          text-shadow: 0 2px 40px rgba(139,92,246,0.4);
        }

        .total-amount .dollar-sign {
          font-size: 0.6em;
          vertical-align: super;
          opacity: 0.7;
          margin-right: 2px;
        }

        .hero-stats { display: flex; gap: 40px; flex-wrap: wrap; }

        .hero-stat-label {
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(255,255,255,0.38);
          margin-bottom: 5px;
        }

        .hero-stat-val {
          font-family: 'Outfit', sans-serif;
          font-weight: 700;
          font-size: 1.35rem;
          color: rgba(255,255,255,0.92);
          letter-spacing: -0.01em;
        }

        .hero-stat-val.up   { color: #fca5a5; }
        .hero-stat-val.down { color: #6ee7b7; }
        .hero-stat-val.neu  { color: rgba(255,255,255,0.85); }

        /* ── HEADER ── */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }

        .brand-name {
          font-family: 'Outfit', sans-serif;
          font-weight: 800;
          font-size: 1.55rem;
          color: #1e1e2e;
          letter-spacing: -0.02em;
        }

        .brand-sub {
          font-size: 0.76rem;
          color: #94a3b8;
          margin-top: 2px;
          font-weight: 400;
        }

        /* ── TABS ── */
        .tab-bar { display: flex; gap: 4px; margin-bottom: 20px; background: #e8eaf2; padding: 4px; border-radius: 14px; width: fit-content; }

        .tab-btn {
          padding: 8px 20px;
          border-radius: 10px;
          font-size: 0.84rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          background: transparent;
          color: #64748b;
          font-family: 'Plus Jakarta Sans', sans-serif;
          transition: all 0.18s;
        }

        .tab-btn.on {
          background: #ffffff;
          color: #1e1e2e;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .tab-btn:hover:not(.on) { color: #475569; background: rgba(255,255,255,0.5); }

        /* ── CARDS ── */
        .card {
          background: #ffffff;
          border: 1px solid #e8eaf2;
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03);
        }

        .card-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.78rem;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 20px;
        }

        /* ── INPUTS ── */
        .inp {
          background: #f8f9fc;
          border: 1.5px solid #e2e6f0;
          color: #1e1e2e;
          border-radius: 14px;
          padding: 13px 16px;
          font-size: 0.9rem;
          width: 100%;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .inp::placeholder { color: #b0b8cc; }
        .inp:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); background: #fff; }

        .sel {
          background: #f8f9fc;
          border: 1.5px solid #e2e6f0;
          color: #1e1e2e;
          border-radius: 14px;
          padding: 13px 16px;
          font-size: 0.9rem;
          width: 100%;
          outline: none;
          cursor: pointer;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 500;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M6 8L0 0h12z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          padding-right: 38px;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .sel:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); background-color: #fff; outline: none; }
        .sel option { background: #fff; color: #1e1e2e; }

        /* ── BUTTONS ── */
        .btn-primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          font-weight: 700;
          padding: 13px 24px;
          border-radius: 14px;
          border: none;
          cursor: pointer;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.9rem;
          white-space: nowrap;
          transition: opacity 0.18s, transform 0.12s, box-shadow 0.18s;
          box-shadow: 0 4px 14px rgba(99,102,241,0.35);
        }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(99,102,241,0.45); }
        .btn-primary:active { transform: translateY(0); }

        .btn-outline {
          background: transparent;
          color: #6366f1;
          padding: 9px 18px;
          border-radius: 12px;
          border: 1.5px solid #c7d2fe;
          cursor: pointer;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.82rem;
          font-weight: 600;
          transition: all 0.18s;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .btn-outline:hover { background: #eef2ff; border-color: #6366f1; }

        .btn-ghost-red {
          background: #fff0f0;
          color: #ef4444;
          border: 1.5px solid #fecaca;
          padding: 9px 18px;
          border-radius: 12px;
          cursor: pointer;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.82rem;
          font-weight: 600;
          transition: all 0.18s;
        }
        .btn-ghost-red:hover { background: #fee2e2; }

        /* ── AI SUGGESTION PILL ── */
        .ai-suggestion {
          position: absolute;
          left: 0; right: 0;
          top: calc(100% + 6px);
          z-index: 20;
          padding: 10px 12px;
          background: #fff;
          border: 1.5px solid #c7d2fe;
          border-radius: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 6px 20px rgba(99,102,241,0.14);
        }

        .ai-pulse {
          width: 8px; height: 8px; border-radius: 50%;
          background: #6366f1;
          animation: pulse 1.2s ease-in-out infinite;
          flex-shrink: 0;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        /* ── TABLE ── */
        .exp-table { width: 100%; border-collapse: collapse; }
        .exp-table th { padding: 11px 16px; text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.09em; color: #94a3b8; font-weight: 600; border-bottom: 1.5px solid #f1f3f9; font-family: 'Plus Jakarta Sans', sans-serif; }
        .exp-table td { padding: 14px 16px; border-bottom: 1px solid #f1f3f9; font-size: 0.9rem; }
        .exp-table tr:last-child td { border-bottom: none; }
        .exp-table tbody tr:hover td { background: #fafbff; }

        .cat-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.74rem; font-weight: 600; }

        /* ── MONTHLY CHART ── */
        .month-col { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; min-width: 40px; }
        .month-bar-bg { width: 100%; background: #f1f3f9; border-radius: 8px 8px 4px 4px; display: flex; align-items: flex-end; height: 110px; overflow: hidden; }
        .month-bar-fill { width: 100%; transition: height 0.9s cubic-bezier(0.4,0,0.2,1); border-radius: 8px 8px 0 0; }

        /* ── STAT MINI CARDS ── */
        .stat-mini { background: #f8f9fc; border: 1px solid #e8eaf2; border-radius: 14px; padding: 18px 20px; }
        .stat-mini-label { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.09em; color: #94a3b8; margin-bottom: 6px; }
        .stat-mini-val { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1.4rem; color: #1e1e2e; letter-spacing: -0.01em; }

        /* ── RECENT ITEMS ── */
        .recent-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 13px 14px; background: #f8f9fc; border-radius: 13px;
          border: 1px solid #f0f2f8;
          transition: background 0.15s, border-color 0.15s;
          margin-bottom: 8px;
        }
        .recent-item:hover { background: #eef2ff; border-color: #c7d2fe; }
        .recent-item:last-child { margin-bottom: 0; }

        /* ── CHAT ── */
        .chat-window {
          position: fixed; bottom: 92px; right: 22px; width: 355px; max-height: 490px;
          display: flex; flex-direction: column;
          background: #fff; border: 1px solid #e2e8f0;
          border-radius: 22px; box-shadow: 0 20px 50px rgba(0,0,0,0.15), 0 0 0 1px rgba(99,102,241,0.08);
          z-index: 200; overflow: hidden;
          animation: chatSlide 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }

        @keyframes chatSlide {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: none; }
        }

        .chat-head {
          padding: 14px 16px;
          background: linear-gradient(135deg, #1a1060, #2d1b8e);
          display: flex; align-items: center; justify-content: space-between;
        }

        .chat-msgs {
          flex: 1; overflow-y: auto; padding: 14px;
          display: flex; flex-direction: column; gap: 10px;
          background: #fafbff;
          scrollbar-width: thin; scrollbar-color: #e2e8f0 transparent;
        }

        .msg-u {
          align-self: flex-end;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          padding: 10px 14px; border-radius: 16px 16px 4px 16px;
          font-size: 0.85rem; max-width: 80%; line-height: 1.45;
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .msg-a {
          align-self: flex-start;
          background: #fff;
          color: #334155;
          padding: 10px 14px; border-radius: 16px 16px 16px 4px;
          font-size: 0.85rem; max-width: 85%; line-height: 1.5;
          border: 1px solid #e8eaf2;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .chat-foot { padding: 10px 12px; border-top: 1px solid #f1f3f9; display: flex; gap: 8px; background: #fff; }

        .fab {
          position: fixed; bottom: 24px; right: 22px;
          width: 56px; height: 56px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 18px; display: flex; align-items: center; justify-content: center;
          cursor: pointer; box-shadow: 0 8px 24px rgba(99,102,241,0.4); border: none;
          transition: transform 0.18s, box-shadow 0.18s; z-index: 199; font-size: 1.35rem;
        }
        .fab:hover { transform: scale(1.08) translateY(-2px); box-shadow: 0 12px 30px rgba(99,102,241,0.55); }

        .dot { width: 5px; height: 5px; background: #6366f1; border-radius: 50%; display: inline-block; animation: dotB 1.1s ease-in-out infinite; }
        .dot:nth-child(2) { animation-delay: .18s; }
        .dot:nth-child(3) { animation-delay: .36s; }
        @keyframes dotB { 0%,60%,100% { transform: translateY(0); opacity:.35; } 30% { transform: translateY(-5px); opacity:1; } }

        /* ── MISC ── */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
      `}</style>

      <div className="dash-root">
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 110px' }}>

          {/* ── PAGE HEADER ── */}
          <div className="page-header">
            <div>
              <div className="brand-name">💰 FinanceAI</div>
              <div className="brand-sub">Your intelligent money companion{username ? <span style={{ color: '#6366f1', fontWeight: 600, marginLeft: 8 }}>· Welcome back, {username}!</span> : null}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-outline" onClick={exportCSV}>↓ Export CSV</button>
              <button className="btn-ghost-red" onClick={handleLogout}>Logout</button>
            </div>
          </div>

          {/* ── HERO ── */}
          <div className="hero">
            <div className="hero-glow-a" /><div className="hero-glow-b" />

            {/* Floating $ bubbles */}
            {[
              { s: 90,  top: '8%',  left: '2%',   d: '0s',   dur: '5.2s', fs: '2rem'    },
              { s: 50,  top: '62%', left: '8%',   d: '1.6s', dur: '4.6s', fs: '1.1rem'  },
              { s: 36,  top: '20%', left: '22%',  d: '3s',   dur: '6.2s', fs: '0.8rem'  },
              { s: 105, top: '5%',  right: '4%',  d: '0.8s', dur: '4.8s', fs: '2.25rem' },
              { s: 60,  top: '56%', right: '10%', d: '2.1s', dur: '5.5s', fs: '1.3rem'  },
              { s: 42,  top: '76%', right: '27%', d: '3.4s', dur: '5.1s', fs: '0.92rem' },
              { s: 68,  top: '26%', right: '21%', d: '1.3s', dur: '4.4s', fs: '1.5rem'  },
              { s: 32,  top: '70%', left: '36%',  d: '4.2s', dur: '6.6s', fs: '0.72rem' },
            ].map((b, i) => (
              <div key={i} className="dollar-bubble"
                style={{ width: b.s, height: b.s, top: b.top, left: (b as any).left, right: (b as any).right, animationDuration: b.dur, animationDelay: b.d, fontSize: b.fs }}>
                $
              </div>
            ))}

            <div className="hero-content">
              <div className="hero-label">Total Spent</div>
              <div className="total-amount">
                <span className="dollar-sign">$</span>{totalSpent.toFixed(2)}
              </div>

              <div className="hero-stats">
                <div>
                  <div className="hero-stat-label">This Month</div>
                  <div className="hero-stat-val neu">${currentMonthSpend.toFixed(2)}</div>
                </div>
                {monthOverMonth !== null && (
                  <div>
                    <div className="hero-stat-label">vs Last Month</div>
                    <div className={`hero-stat-val ${parseFloat(monthOverMonth) > 0 ? 'up' : 'down'}`}>
                      {parseFloat(monthOverMonth) > 0 ? '▲' : '▼'} {Math.abs(parseFloat(monthOverMonth))}%
                    </div>
                  </div>
                )}
                <div>
                  <div className="hero-stat-label">Transactions</div>
                  <div className="hero-stat-val neu">{expenses.length}</div>
                </div>
                {sortedCategories[0] && (
                  <div>
                    <div className="hero-stat-label">Top Category</div>
                    <div className="hero-stat-val neu">{sortedCategories[0].name}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── TAB BAR ── */}
          <div className="tab-bar">
            {(['overview','monthly','expenses'] as const).map(t => (
              <button key={t} className={`tab-btn ${activeTab === t ? 'on' : ''}`} onClick={() => setActiveTab(t)}>
                {t === 'overview' ? '📊 Overview' : t === 'monthly' ? '📅 Monthly' : '📋 All Expenses'}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 18, marginBottom: 20 }}>
              <div className="card">
                <div className="card-title">By Category</div>
                {sortedCategories.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                    {sortedCategories.map((cat, i) => {
                      const pct = Math.round((cat.value / totalSpent) * 100);
                      const col = CATEGORY_COLORS[cat.name] || '#6b7280';
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.875rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, color: '#334155' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, display: 'inline-block', flexShrink: 0 }} />
                              {cat.name}
                            </span>
                            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>
                              ${cat.value.toFixed(2)} <span style={{ color: '#b0b8cc' }}>({pct}%)</span>
                            </span>
                          </div>
                          <div style={{ height: 5, background: '#f1f3f9', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 4, opacity: 0.85, transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: '#b0b8cc', textAlign: 'center', padding: '32px 0', fontSize: '0.875rem' }}>Add expenses to see breakdown</p>
                )}
              </div>

              <div className="card">
                <div className="card-title">Recent</div>
                {expenses.length > 0 ? (
                  <div>
                    {expenses.slice(0, 5).map(exp => {
                      const col = CATEGORY_COLORS[exp.category] || '#6b7280';
                      return (
                        <div key={exp.id} className="recent-item">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${col}18`, border: `1.5px solid ${col}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, color: col, flexShrink: 0 }}>
                              {exp.category[0]}
                            </div>
                            <div>
                              <p style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e1e2e' }}>{exp.description}</p>
                              <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>{new Date(exp.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: '#1e1e2e', fontSize: '1rem' }}>${exp.amount.toFixed(2)}</p>
                            <span style={{ fontSize: '0.7rem', color: col, fontWeight: 600 }}>{exp.category}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: '#b0b8cc', textAlign: 'center', padding: '32px 0', fontSize: '0.875rem' }}>No expenses yet</p>
                )}
              </div>
            </div>
          )}

          {/* ── MONTHLY TAB ── */}
          {activeTab === 'monthly' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
              <div className="card">
                <div className="card-title">Monthly Spend</div>
                {monthlyEntries.length > 0 ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 6 }}>
                    {monthlyEntries.map(([mon, val]) => {
                      const h = Math.round((val / maxMonthlyValue) * 100);
                      const isCurr = mon === currentMonth;
                      return (
                        <div key={mon} className="month-col">
                          <p style={{ fontFamily: 'Outfit,sans-serif', color: isCurr ? '#6366f1' : '#94a3b8', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            ${val >= 1000 ? (val/1000).toFixed(1)+'k' : val.toFixed(0)}
                          </p>
                          <div className="month-bar-bg">
                            <div className="month-bar-fill" style={{ height: `${h}%`, background: isCurr ? 'linear-gradient(180deg,#8b5cf6,#6366f1)' : 'linear-gradient(180deg,#a5b4fc,#818cf8)' }} />
                          </div>
                          <p style={{ color: isCurr ? '#6366f1' : '#94a3b8', fontSize: '0.68rem', fontWeight: isCurr ? 700 : 400, whiteSpace: 'nowrap' }}>{mon}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: '#b0b8cc', textAlign: 'center', padding: '40px 0', fontSize: '0.875rem' }}>No data yet</p>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 12 }}>
                {monthlyEntries.slice().reverse().slice(0, 6).map(([mon, val]) => {
                  const txCount = expenses.filter(e => new Date(e.date).toLocaleString('default', { month:'short', year:'2-digit' }) === mon).length;
                  return (
                    <div key={mon} className="stat-mini">
                      <div className="stat-mini-label">{mon}</div>
                      <div className="stat-mini-val">${val.toFixed(2)}</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.74rem', marginTop: 5 }}>{txCount} transaction{txCount !== 1 ? 's' : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ADD EXPENSE (always visible) ── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Add Expense</div>
            {error && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: '0.875rem' }}>{error}</p>}
            <form onSubmit={handleAddExpense}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12, alignItems: 'start' }}>

                <input
                  type="number" step="0.01" placeholder="Amount"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="inp" required
                />

                <div style={{ position: 'relative' }}>
                  <input
                    type="text" placeholder="Description (AI will suggest category)"
                    value={description} onChange={e => setDescription(e.target.value)}
                    className="inp" required
                  />

                  {/* Loading indicator */}
                  {isPredicting && (
                    <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
                      <div style={{ width: 16, height: 16, border: '2px solid #e2e6f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  )}

                  {/* AI Suggestion dropdown */}
                  {suggestedCategory && !isPredicting && (
                    <div className="ai-suggestion">
                      {/* confidence ring */}
                      <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
                        <svg width="38" height="38" style={{ transform: 'rotate(-90deg)' }} viewBox="0 0 42 42">
                          <circle cx="21" cy="21" r="15" fill="none" stroke="#f1f3f9" strokeWidth="4" />
                          <circle cx="21" cy="21" r="15" fill="none"
                            stroke={confidence >= 80 ? '#10b981' : confidence >= 60 ? '#f59e0b' : '#ef4444'}
                            strokeWidth="4"
                            strokeDasharray={`${confidence}, 100`}
                            strokeLinecap="round"
                            style={{ transition: 'all 0.7s' }}
                          />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#475569' }}>
                          {confidence}%
                        </div>
                      </div>

                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: '0 0 2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI suggests</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e1e2e', margin: 0 }}>{suggestedCategory}</p>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button type="button" onClick={useSuggestion}
                          style={{ width: 34, height: 34, background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: 8, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#d1fae5'}
                          onMouseLeave={e => e.currentTarget.style.background = '#ecfdf5'}>
                          👍
                        </button>
                        <button type="button"
                          onClick={() => { setFeedbackDescription(description); setFeedbackPredicted(suggestedCategory); setShowFeedbackModal(true); }}
                          style={{ width: 34, height: 34, background: '#fff0f0', border: '1.5px solid #fca5a5', borderRadius: 8, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff0f0'}>
                          👎
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <select value={category} onChange={e => setCategory(e.target.value)} className="sel">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <button type="submit" className="btn-primary">+ Add Expense</button>
              </div>
            </form>
          </div>

          {/* ── EXPENSES TABLE TAB ── */}
          {activeTab === 'expenses' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div className="card-title" style={{ margin: 0 }}>All Expenses ({expenses.length})</div>
                <button className="btn-outline" onClick={exportCSV}>↓ Export CSV</button>
              </div>
              {expenses.length === 0 ? (
                <p style={{ color: '#b0b8cc', textAlign: 'center', padding: '44px 0', fontSize: '0.875rem' }}>No expenses yet. Add your first one above!</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="exp-table">
                    <thead>
                      <tr>
                        <th>Date</th><th>Description</th><th>Category</th>
                        <th style={{ textAlign: 'right' }}>Amount</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map(exp => {
                        const col = CATEGORY_COLORS[exp.category] || '#6b7280';
                        return (
                          <tr key={exp.id}>
                            <td style={{ color: '#94a3b8', fontSize: '0.84rem' }}>{new Date(exp.date).toLocaleDateString()}</td>
                            <td style={{ color: '#1e1e2e', fontWeight: 500 }}>{exp.description}</td>
                            <td>
                              <span className="cat-badge" style={{ background: `${col}15`, color: col, border: `1px solid ${col}30` }}>
                                {exp.category}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: '#1e1e2e' }}>${exp.amount.toFixed(2)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <button onClick={() => handleDelete(exp.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '1rem', padding: '4px 8px', borderRadius: 6, transition: 'color 0.15s' }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                                🗑
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── FEEDBACK MODAL ── */}
        {showFeedbackModal && feedbackPredicted && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '10px 14px', width: 'auto', maxWidth: '95vw', boxShadow: '0 12px 40px rgba(0,0,0,0.14)', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ fontSize: '0.77rem', color: '#64748b', fontFamily: 'Plus Jakarta Sans, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}>
                Wrong? Pick:
              </span>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => submitFeedback(cat)}
                  style={{ padding: '6px 12px', background: '#f8f9fc', border: '1.5px solid #e2e6f0', borderRadius: 8, fontSize: '0.79rem', color: '#334155', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0 }}
                  onMouseEnter={e => { const t = e.currentTarget; t.style.background='#eef2ff'; t.style.borderColor='#6366f1'; t.style.color='#6366f1'; }}
                  onMouseLeave={e => { const t = e.currentTarget; t.style.background='#f8f9fc'; t.style.borderColor='#e2e6f0'; t.style.color='#334155'; }}>
                  {cat}
                </button>
              ))}
              <button onClick={() => setShowFeedbackModal(false)}
                style={{ padding: '6px 10px', background: 'transparent', border: 'none', fontSize: '0.79rem', color: '#94a3b8', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}>
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── TOAST ── */}
        {toast && (
          <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', padding: '12px 22px', borderRadius: 14, background: toast.type === 'success' ? '#f0fdf4' : '#fff5f5', border: `1.5px solid ${toast.type === 'success' ? '#86efac' : '#fca5a5'}`, color: toast.type === 'success' ? '#16a34a' : '#dc2626', fontSize: '0.875rem', fontWeight: 600, zIndex: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {toast.type === 'success' ? '✓' : '✕'} {toast.message}
          </div>
        )}

        {/* ── CHATBOT ── */}
        {chatOpen && (
          <div className="chat-window">
            <div className="chat-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>💬</div>
                <div>
                  <p style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>Finance Assistant</p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)' }}>Powered by Claude</p>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>✕</button>
            </div>

            <div className="chat-msgs">
              {chatMessages.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'msg-u' : 'msg-a'}>{msg.content}</div>
              ))}
              {chatLoading && (
                <div className="msg-a" style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '12px 14px' }}>
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="chat-foot">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                placeholder="Ask about your finances..." className="inp"
                style={{ borderRadius: 11, padding: '10px 13px', fontSize: '0.84rem', flex: 1 }}
              />
              <button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 11, width: 38, height: 38, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: chatLoading || !chatInput.trim() ? 0.4 : 1, transition: 'opacity 0.15s', color: '#fff' }}>
                ↑
              </button>
            </div>
          </div>
        )}

        <button className="fab" onClick={() => setChatOpen(p => !p)}>
          {chatOpen ? '✕' : '💬'}
        </button>
      </div>
    </>
  );
};

export default Dashboard;