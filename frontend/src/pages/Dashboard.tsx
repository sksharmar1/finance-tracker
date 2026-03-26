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
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [feedbackPredicted, setFeedbackPredicted] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'monthly' | 'expenses'>('overview');

  // Chatbot state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hi! I'm your finance assistant 💰 Ask me anything about budgeting, spending habits, or saving tips!" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();

  useEffect(() => { fetchExpenses(); }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchExpenses = async () => {
    try {
      const res = await api.get('/expenses');
      setExpenses(res.data || []);
    } catch (err) { console.error(err); }
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
      if (description.trim().length > 3) {
        try {
          const res = await api.post('/predict-category', { description });
          setSuggestedCategory(res.data.category);
          setConfidence(Math.round((res.data.confidence || 0) * 100));
        } catch {
          setSuggestedCategory('');
          setConfidence(0);
        }
      } else {
        setSuggestedCategory('');
        setConfidence(0);
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
          system: `You are a helpful personal finance assistant embedded in a finance tracking app. Be concise, friendly, and practical. Give specific, actionable advice. Here is the user's current spending data for context: ${spendingSummary} Keep responses under 120 words unless detail is genuinely needed.`,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await response.json();
      const reply = data.content?.find((b: any) => b.type === 'text')?.text || "Sorry, I couldn't respond right now.";
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
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');

        * { box-sizing: border-box; }

        .dash-root {
          font-family: 'DM Sans', sans-serif;
          background: #080810;
          min-height: 100vh;
          color: #e2e2f0;
        }

        .syne { font-family: 'Syne', sans-serif; }

        /* ── HERO ── */
        .hero {
          position: relative;
          overflow: hidden;
          background: #0c0c1a;
          border: 1px solid rgba(255,255,255,0.055);
          border-radius: 24px;
          padding: 44px 52px;
          margin-bottom: 24px;
        }

        .hero-glow-1 { position:absolute; width:500px; height:500px; border-radius:50%; background: radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 70%); top:-120px; left:-100px; pointer-events:none; }
        .hero-glow-2 { position:absolute; width:400px; height:400px; border-radius:50%; background: radial-gradient(circle, rgba(168,85,247,0.16) 0%, transparent 70%); bottom:-80px; right:-60px; pointer-events:none; }
        .hero-glow-3 { position:absolute; width:300px; height:300px; border-radius:50%; background: radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%); top:30%; right:20%; pointer-events:none; }

        .hero-grid {
          position: absolute;
          inset: 0;
          background-image: linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        .dollar-bubble {
          position: absolute;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          color: rgba(165,180,252,0.09);
          border: 1px solid rgba(165,180,252,0.07);
          background: rgba(99,102,241,0.04);
          pointer-events: none;
          user-select: none;
          animation: floatDollar ease-in-out infinite;
        }

        @keyframes floatDollar {
          0%,100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-16px) rotate(6deg); }
        }

        .total-amount {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: clamp(3rem, 7vw, 5.5rem);
          background: linear-gradient(135deg, #ffffff 0%, #c7d2fe 45%, #a5b4fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.04em;
          line-height: 1;
          margin-bottom: 28px;
        }

        .hero-stats { display: flex; gap: 36px; flex-wrap: wrap; }
        .hero-stat-label { color: #374151; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; margin-bottom: 4px; }
        .hero-stat-val { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 1.3rem; }

        /* ── NAVBAR ── */
        .tab-bar { display: flex; gap: 6px; margin-bottom: 20px; }
        .tab-btn {
          padding: 9px 18px; border-radius: 11px; font-size: 0.82rem; font-weight: 500;
          cursor: pointer; transition: all 0.18s; border: 1px solid transparent;
          background: transparent; color: #4b5563; font-family: 'DM Sans', sans-serif;
        }
        .tab-btn.on { background: rgba(99,102,241,0.14); border-color: rgba(99,102,241,0.28); color: #a5b4fc; }
        .tab-btn:hover:not(.on) { color: #9ca3af; background: rgba(255,255,255,0.04); }

        /* ── CARDS ── */
        .card {
          background: rgba(12,12,26,0.9);
          border: 1px solid rgba(255,255,255,0.065);
          border-radius: 20px;
          padding: 26px;
        }

        .card-title { font-family:'Syne',sans-serif; font-size:0.78rem; font-weight:700; color:#7c3aed; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:18px; }

        /* ── INPUTS ── */
        .inp {
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.08);
          color: #e2e2f0;
          border-radius: 13px;
          padding: 13px 15px;
          font-size: 0.875rem;
          width: 100%;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          font-family: 'DM Sans', sans-serif;
        }
        .inp::placeholder { color: #374151; }
        .inp:focus { border-color: rgba(99,102,241,0.45); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

        .sel {
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.08);
          color: #e2e2f0; border-radius: 13px;
          padding: 13px 15px; font-size: 0.875rem;
          width: 100%; outline: none; cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          padding-right: 36px;
        }
        .sel option { background: #12121e; }

        /* ── BUTTONS ── */
        .btn-p { background: linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff; font-weight:600; padding:13px 22px; border-radius:13px; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:0.875rem; transition:opacity 0.18s, transform 0.12s; white-space:nowrap; }
        .btn-p:hover { opacity:0.88; transform:translateY(-1px); }
        .btn-o { background:transparent; color:#818cf8; padding:9px 16px; border-radius:11px; border:1px solid rgba(99,102,241,0.3); cursor:pointer; font-family:'DM Sans',sans-serif; font-size:0.82rem; font-weight:500; transition:all 0.18s; display:inline-flex; align-items:center; gap:5px; }
        .btn-o:hover { background:rgba(99,102,241,0.1); border-color:rgba(99,102,241,0.5); }
        .btn-danger { background:rgba(239,68,68,0.1); color:#f87171; border:1px solid rgba(239,68,68,0.22); padding:9px 16px; border-radius:11px; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:0.82rem; font-weight:500; transition:all 0.18s; }
        .btn-danger:hover { background:rgba(239,68,68,0.18); }

        /* ── TABLE ── */
        .t { width:100%; border-collapse:collapse; }
        .t th { padding:11px 14px; text-align:left; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.09em; color:#374151; font-weight:600; border-bottom:1px solid rgba(255,255,255,0.055); }
        .t td { padding:13px 14px; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.875rem; }
        .t tr:hover td { background:rgba(99,102,241,0.04); }
        .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:0.72rem; font-weight:500; }

        /* ── CHAT ── */
        .chat-window {
          position:fixed; bottom:96px; right:22px; width:350px; max-height:480px;
          display:flex; flex-direction:column;
          background:#0e0e1c; border:1px solid rgba(99,102,241,0.28);
          border-radius:20px; box-shadow:0 24px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(99,102,241,0.08);
          z-index:200; overflow:hidden;
          animation: chatIn 0.22s cubic-bezier(0.4,0,0.2,1);
        }
        @keyframes chatIn { from{opacity:0;transform:translateY(16px) scale(0.96)} to{opacity:1;transform:none} }

        .chat-head { padding:13px 15px; background:linear-gradient(135deg,rgba(79,70,229,0.22),rgba(124,58,237,0.16)); border-bottom:1px solid rgba(255,255,255,0.055); display:flex; align-items:center; justify-content:space-between; }
        .chat-msgs { flex:1; overflow-y:auto; padding:13px; display:flex; flex-direction:column; gap:9px; scrollbar-width:thin; scrollbar-color:rgba(99,102,241,0.25) transparent; }
        .msg-u { align-self:flex-end; background:linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff; padding:9px 13px; border-radius:15px 15px 3px 15px; font-size:0.82rem; max-width:80%; line-height:1.45; }
        .msg-a { align-self:flex-start; background:rgba(255,255,255,0.055); color:#d1d5db; padding:9px 13px; border-radius:15px 15px 15px 3px; font-size:0.82rem; max-width:85%; line-height:1.5; border:1px solid rgba(255,255,255,0.055); }
        .chat-foot { padding:9px 11px; border-top:1px solid rgba(255,255,255,0.055); display:flex; gap:7px; }

        .fab { position:fixed; bottom:24px; right:22px; width:56px; height:56px; background:linear-gradient(135deg,#4f46e5,#7c3aed); border-radius:18px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 8px 24px rgba(79,70,229,0.45); border:none; transition:transform 0.18s, box-shadow 0.18s; z-index:199; font-size:1.4rem; }
        .fab:hover { transform:scale(1.07) translateY(-2px); box-shadow:0 12px 30px rgba(79,70,229,0.6); }

        .dot { width:5px;height:5px;background:#818cf8;border-radius:50%;display:inline-block;animation:dotBounce 1.1s ease-in-out infinite; }
        .dot:nth-child(2){animation-delay:.18s} .dot:nth-child(3){animation-delay:.36s}
        @keyframes dotBounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}

        /* ── MONTHLY BARS ── */
        .month-col { display:flex; flex-direction:column; align-items:center; gap:5px; flex:1; min-width:36px; }
        .month-bar-bg { width:100%; background:rgba(255,255,255,0.04); border-radius:5px; overflow:hidden; display:flex; align-items:flex-end; height:100px; }
        .month-bar-fill { width:100%; border-radius:5px 5px 0 0; transition:height 0.9s cubic-bezier(0.4,0,0.2,1); }

        /* ── MISC ── */
        ::-webkit-scrollbar{width:3px;height:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.25);border-radius:3px}
      `}</style>

      <div className="dash-root">
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 120px' }}>

          {/* ── HEADER ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <h1 className="syne" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1f1fa', margin: 0 }}>FinanceAI</h1>
              <p style={{ color: '#374151', fontSize: '0.75rem', margin: '2px 0 0' }}>Your intelligent money companion</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-o" onClick={exportCSV}>↓ Export CSV</button>
              <button className="btn-danger" onClick={handleLogout}>Logout</button>
            </div>
          </div>

          {/* ── HERO ── */}
          <div className="hero">
            <div className="hero-glow-1" /><div className="hero-glow-2" /><div className="hero-glow-3" />
            <div className="hero-grid" />
            {/* floating $ bubbles */}
            {[
              { s:88, t:'6%',  l:'1%',   d:'0s',   dur:'5.2s', fs:'2rem'   },
              { s:52, t:'62%', l:'7%',   d:'1.6s', dur:'4.5s', fs:'1.1rem' },
              { s:38, t:'22%', l:'20%',  d:'2.9s', dur:'6.1s', fs:'0.85rem'},
              { s:108,t:'4%',  r:'5%',   d:'0.7s', dur:'4.8s', fs:'2.3rem' },
              { s:62, t:'55%', r:'11%',  d:'2.1s', dur:'5.6s', fs:'1.35rem'},
              { s:42, t:'78%', r:'26%',  d:'3.3s', dur:'5s',   fs:'0.95rem'},
              { s:70, t:'28%', r:'20%',  d:'1.2s', dur:'4.3s', fs:'1.55rem'},
              { s:34, t:'72%', l:'34%',  d:'4.1s', dur:'6.5s', fs:'0.75rem'},
            ].map((b, i) => (
              <div key={i} className="dollar-bubble" style={{ width: b.s, height: b.s, top: b.t, left: (b as any).l, right: (b as any).r, animationDuration: b.dur, animationDelay: b.d, fontSize: b.fs }}>$</div>
            ))}

            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ color: '#374151', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600, margin: '0 0 10px' }}>Total Spent</p>
              <div className="total-amount">${totalSpent.toFixed(2)}</div>

              <div className="hero-stats">
                <div>
                  <div className="hero-stat-label">This Month</div>
                  <div className="hero-stat-val" style={{ color: '#a5b4fc' }}>${currentMonthSpend.toFixed(2)}</div>
                </div>
                {monthOverMonth !== null && (
                  <div>
                    <div className="hero-stat-label">vs Last Month</div>
                    <div className="hero-stat-val" style={{ color: parseFloat(monthOverMonth) > 0 ? '#f87171' : '#34d399' }}>
                      {parseFloat(monthOverMonth) > 0 ? '+' : ''}{monthOverMonth}%
                    </div>
                  </div>
                )}
                <div>
                  <div className="hero-stat-label">Transactions</div>
                  <div className="hero-stat-val" style={{ color: '#c4b5fd' }}>{expenses.length}</div>
                </div>
                {sortedCategories[0] && (
                  <div>
                    <div className="hero-stat-label">Top Category</div>
                    <div className="hero-stat-val" style={{ color: '#93c5fd' }}>{sortedCategories[0].name}</div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px,1fr))', gap: 18, marginBottom: 20 }}>
              <div className="card">
                <div className="card-title">By Category</div>
                {sortedCategories.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {sortedCategories.map((cat, i) => {
                      const pct = Math.round((cat.value / totalSpent) * 100);
                      const col = CATEGORY_COLORS[cat.name] || '#6b7280';
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.82rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, display: 'inline-block', flexShrink: 0 }} />
                              {cat.name}
                            </span>
                            <span style={{ color: '#9ca3af' }}>${cat.value.toFixed(2)} <span style={{ color: '#374151' }}>({pct}%)</span></span>
                          </div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3, opacity: 0.8, transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: '#374151', textAlign: 'center', padding: '28px 0', fontSize: '0.825rem' }}>Add expenses to see breakdown</p>
                )}
              </div>

              <div className="card">
                <div className="card-title">Recent</div>
                {expenses.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {expenses.slice(0, 5).map(exp => {
                      const col = CATEGORY_COLORS[exp.category] || '#6b7280';
                      return (
                        <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 13px', background: 'rgba(255,255,255,0.025)', borderRadius: 11, border: '1px solid rgba(255,255,255,0.045)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${col}1a`, border: `1px solid ${col}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: col, fontFamily: 'Syne, sans-serif', flexShrink: 0 }}>
                              {exp.category[0]}
                            </div>
                            <div>
                              <p style={{ fontWeight: 500, fontSize: '0.825rem', color: '#e2e2f0', margin: 0 }}>{exp.description}</p>
                              <p style={{ fontSize: '0.7rem', color: '#374151', margin: 0 }}>{new Date(exp.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <p className="syne" style={{ fontWeight: 700, color: '#a5b4fc', fontSize: '0.95rem', margin: 0 }}>${exp.amount.toFixed(2)}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: '#374151', textAlign: 'center', padding: '28px 0', fontSize: '0.825rem' }}>No expenses yet</p>
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
                          <p className="syne" style={{ color: '#818cf8', fontSize: '0.65rem', fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>${val >= 1000 ? (val/1000).toFixed(1)+'k' : val.toFixed(0)}</p>
                          <div className="month-bar-bg">
                            <div className="month-bar-fill" style={{ height: `${h}%`, background: isCurr ? 'linear-gradient(180deg,#c4b5fd,#7c3aed)' : 'linear-gradient(180deg,#818cf8,#4f46e5)' }} />
                          </div>
                          <p style={{ color: isCurr ? '#c4b5fd' : '#374151', fontSize: '0.65rem', fontWeight: isCurr ? 600 : 400, margin: 0, whiteSpace: 'nowrap' }}>{mon}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: '#374151', textAlign: 'center', padding: '36px 0', fontSize: '0.825rem' }}>No data yet</p>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(185px,1fr))', gap: 12 }}>
                {monthlyEntries.slice().reverse().slice(0, 6).map(([mon, val]) => {
                  const txCount = expenses.filter(e => new Date(e.date).toLocaleString('default', { month:'short', year:'2-digit' }) === mon).length;
                  return (
                    <div key={mon} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 18 }}>
                      <p style={{ color: '#374151', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>{mon}</p>
                      <p className="syne" style={{ color: '#a5b4fc', fontWeight: 700, fontSize: '1.4rem', margin: '0 0 4px' }}>${val.toFixed(2)}</p>
                      <p style={{ color: '#374151', fontSize: '0.72rem', margin: 0 }}>{txCount} transaction{txCount !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ADD EXPENSE (always visible) ── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Add Expense</div>
            {error && <p style={{ color: '#f87171', marginBottom: 12, fontSize: '0.825rem' }}>{error}</p>}
            <form onSubmit={handleAddExpense}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 10, alignItems: 'start' }}>
                <input type="number" step="0.01" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} className="inp" required />

                <div style={{ position: 'relative' }}>
                  <input type="text" placeholder="Description (AI suggests)" value={description} onChange={e => setDescription(e.target.value)} className="inp" required />
                  {suggestedCategory && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 5px)', zIndex: 20, padding: '9px 11px', background: '#0e0e1c', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.55)' }}>
                      {/* confidence circle */}
                      <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                        <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }} viewBox="0 0 42 42">
                          <circle cx="21" cy="21" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                          <circle cx="21" cy="21" r="15" fill="none"
                            stroke={confidence >= 80 ? '#10b981' : confidence >= 60 ? '#f59e0b' : '#ef4444'}
                            strokeWidth="4" strokeDasharray={`${confidence}, 100`} strokeLinecap="round"
                            style={{ transition: 'all 0.7s' }}
                          />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.58rem', fontWeight: 700, color: '#c4b5fd' }}>{confidence}%</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.65rem', color: '#374151', margin: 0 }}>AI suggests</p>
                        <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#e2e2f0', margin: 0 }}>{suggestedCategory}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button type="button" onClick={useSuggestion} style={{ width: 30, height: 30, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 7, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👍</button>
                        <button type="button" onClick={() => { setFeedbackDescription(description); setFeedbackPredicted(suggestedCategory); setShowFeedbackModal(true); }} style={{ width: 30, height: 30, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 7, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👎</button>
                      </div>
                    </div>
                  )}
                </div>

                <select value={category} onChange={e => setCategory(e.target.value)} className="sel">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <button type="submit" className="btn-p">+ Add</button>
              </div>
            </form>
          </div>

          {/* ── EXPENSES TABLE TAB ── */}
          {activeTab === 'expenses' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div className="card-title" style={{ margin: 0 }}>All Expenses ({expenses.length})</div>
                <button className="btn-o" onClick={exportCSV}>↓ Export CSV</button>
              </div>
              {expenses.length === 0 ? (
                <p style={{ color: '#374151', textAlign: 'center', padding: '44px 0', fontSize: '0.825rem' }}>No expenses yet. Add your first one above!</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="t">
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
                            <td style={{ color: '#374151' }}>{new Date(exp.date).toLocaleDateString()}</td>
                            <td style={{ color: '#e2e2f0', fontWeight: 500 }}>{exp.description}</td>
                            <td><span className="badge" style={{ background: `${col}18`, color: col, border: `1px solid ${col}30` }}>{exp.category}</span></td>
                            <td style={{ textAlign: 'right', fontFamily: 'Syne, sans-serif', fontWeight: 700, color: '#a5b4fc' }}>${exp.amount.toFixed(2)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <button onClick={() => handleDelete(exp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', fontSize: '0.95rem', padding: '4px 7px', transition: 'color 0.18s', borderRadius: 6 }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#374151')}>🗑</button>
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
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
            <div style={{ background: '#0e0e1c', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 17, padding: '18px 18px 14px', maxWidth: 460, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.65)' }}>
              <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 13 }}>
                <span style={{ color: '#a5b4fc', fontWeight: 600 }}>"{feedbackDescription}"</span> predicted as <span style={{ color: '#c4b5fd', fontWeight: 600 }}>{feedbackPredicted}</span>. Correct it:
              </p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => submitFeedback(cat)}
                    style={{ padding: '7px 13px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, fontSize: '0.78rem', color: '#d1d5db', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s' }}
                    onMouseEnter={e => { const t = e.currentTarget; t.style.background='rgba(99,102,241,0.15)'; t.style.borderColor='rgba(99,102,241,0.38)'; t.style.color='#a5b4fc'; }}
                    onMouseLeave={e => { const t = e.currentTarget; t.style.background='rgba(255,255,255,0.04)'; t.style.borderColor='rgba(255,255,255,0.09)'; t.style.color='#d1d5db'; }}>
                    {cat}
                  </button>
                ))}
                <button onClick={() => setShowFeedbackModal(false)} style={{ padding: '7px 13px', background: 'transparent', border: 'none', fontSize: '0.78rem', color: '#374151', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginLeft: 'auto' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── TOAST ── */}
        {toast && (
          <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', padding: '11px 20px', borderRadius: 13, background: toast.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: toast.type === 'success' ? '#34d399' : '#f87171', fontSize: '0.825rem', fontWeight: 500, zIndex: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7 }}>
            {toast.type === 'success' ? '✓' : '✕'} {toast.message}
          </div>
        )}

        {/* ── CHATBOT ── */}
        {chatOpen && (
          <div className="chat-window">
            <div className="chat-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>💬</div>
                <div>
                  <p className="syne" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#e2e2f0' }}>Finance Assistant</p>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: '#374151' }}>Powered by Claude</p>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 7, width: 26, height: 26, cursor: 'pointer', color: '#6b7280', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div className="chat-msgs">
              {chatMessages.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'msg-u' : 'msg-a'}>{msg.content}</div>
              ))}
              {chatLoading && (
                <div className="msg-a" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="chat-foot">
              <input
                type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                placeholder="Ask about your finances..." className="inp"
                style={{ borderRadius: 10, padding: '9px 12px', fontSize: '0.8rem', flex: 1 }}
              />
              <button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: chatLoading || !chatInput.trim() ? 0.45 : 1, transition: 'opacity 0.15s' }}>
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