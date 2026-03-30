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

interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string;
  emoji: string;
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

const QUOTES = [
  "Compound interest is the eighth wonder of the world",
  "Don't save what is left after spending",
  "An investment in knowledge pays the best interest",
  "The stock market rewards the patient",
  "It's not how much you make — it's how much you keep",
  "Beware of little expenses",
  "Financial freedom is built one habit at a time",
  "Do not put all your eggs in one basket",
  "A budget is telling your money where to go",
  "Wealth is the ability to fully experience life",
  "Cut your coat according to your cloth",
  "Save first, spend what remains",
];

const QuoteBubbles: React.FC = () => {
  const [bubbles, setBubbles] = React.useState<{ id: number; text: string; left: string; top: string; dur: number }[]>([]);
  const counterRef = React.useRef(0);

  React.useEffect(() => {
    const spawn = () => {
      const id = counterRef.current++;
      const text = QUOTES[id % QUOTES.length];
      const left = `${5 + Math.random() * 82}%`;
      const top  = `${8 + Math.random() * 78}%`;
      const dur  = 4000 + Math.random() * 3000; // 4–7s visible
      setBubbles(prev => [...prev, { id, text, left, top, dur }]);
      setTimeout(() => setBubbles(prev => prev.filter(b => b.id !== id)), dur + 200);
    };

    spawn(); // first one immediately
    const interval = setInterval(spawn, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="quote-field">
      {bubbles.map(b => (
        <div key={b.id} className="fquote"
          style={{ left: b.left, top: b.top, animationDuration: `${b.dur}ms` }}>
          {b.text}
        </div>
      ))}
    </div>
  );
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
  const [activeTab, setActiveTab] = useState<'overview' | 'monthly' | 'expenses' | 'report' | 'budgets' | 'goals'>('overview');
  const [username, setUsername] = useState('');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  // Budget caps state
  const [budgets, setBudgets] = useState<Record<string,number>>(() => {
    try { return JSON.parse(localStorage.getItem('budgets') || '{}'); } catch { return {}; }
  });
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState('Food');
  const [budgetAmount, setBudgetAmount] = useState('');

  // Recurring detection state
  const [recurringMap, setRecurringMap] = useState<Record<string,boolean>>({});

  // Natural language input state
  const [nlInput, setNlInput] = useState('');
  const [nlParsing, setNlParsing] = useState(false);
  const [nlMode, setNlMode] = useState(false);

  // Savings Goals state
  const [goals, setGoals] = useState<Goal[]>(() => {
    try { return JSON.parse(localStorage.getItem('savingsGoals') || '[]'); } catch { return []; }
  });
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalSaved, setGoalSaved] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalEmoji, setGoalEmoji] = useState('🎯');
  const [goalAddAmount, setGoalAddAmount] = useState('');
  const [goalAddId, setGoalAddId] = useState('');

  // Receipt scan state
  const [receiptScanning, setReceiptScanning] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Email digest state
  const [digestEmail, setDigestEmail] = useState(() => localStorage.getItem('digestEmail') || '');
  const [digestSaving, setDigestSaving] = useState(false);
  const [showDigestModal, setShowDigestModal] = useState(false);

  // Report state
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [reportError, setReportError] = useState('');

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
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('savingsGoals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('budgets', JSON.stringify(budgets));
  }, [budgets]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const detectRecurring = (exps: Expense[]) => {
    // Group by normalised description, count distinct months
    const descMonths: Record<string, Set<string>> = {};
    exps.forEach(e => {
      const key = e.description.toLowerCase().trim();
      const month = new Date(e.date).toISOString().slice(0, 7);
      if (!descMonths[key]) descMonths[key] = new Set();
      descMonths[key].add(month);
    });
    const map: Record<string, boolean> = {};
    Object.entries(descMonths).forEach(([key, months]) => {
      if (months.size >= 2) map[key] = true;
    });
    setRecurringMap(map);
  };

  const fetchExpenses = async () => {
    try {
      const res = await api.get('/expenses');
      setExpenses(res.data || []);
      detectRecurring(res.data || []);
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
      const updatedRes = await api.get('/expenses');
      const updatedExps = updatedRes.data || [];
      setExpenses(updatedExps);
      detectRecurring(updatedExps);
      // Check budget cap for this category
      const catBudget = budgets[category];
      if (catBudget) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const catSpent = updatedExps
          .filter((e: Expense) => e.category === category && e.date.startsWith(currentMonth))
          .reduce((sum: number, e: Expense) => sum + e.amount, 0);
        const pct = (catSpent / catBudget) * 100;
        if (pct >= 100) showToast(`🚨 ${category} budget exceeded! ($${catSpent.toFixed(0)}/$${catBudget})`, 'error');
        else if (pct >= 80) showToast(`⚠️ ${category} at ${Math.round(pct)}% of budget`, 'error');
        else showToast('Expense added!', 'success');
      } else {
        showToast('Expense added!', 'success');
      }
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

  // Budget cap handlers
  const saveBudget = () => {
    if (!budgetAmount || parseFloat(budgetAmount) <= 0) return;
    setBudgets(prev => ({ ...prev, [budgetCategory]: parseFloat(budgetAmount) }));
    setBudgetAmount('');
    setShowBudgetModal(false);
    showToast(`Budget set: ${budgetCategory} → $${parseFloat(budgetAmount).toFixed(0)}/mo`, 'success');
  };

  const removeBudget = (cat: string) => {
    setBudgets(prev => { const n = { ...prev }; delete n[cat]; return n; });
    showToast(`Budget removed for ${cat}`, 'success');
  };

  // Natural language expense parser
  const handleNLSubmit = async () => {
    if (!nlInput.trim() || nlParsing) return;
    setNlParsing(true);
    try {
      const res = await api.post('/parse-expense', { text: nlInput });
      const { amount: a, description: d, category: c } = res.data;
      setAmount(String(a));
      setDescription(d);
      setCategory(c);
      setNlInput('');
      setNlMode(false);
      showToast(`Parsed: ${d} · $${a} · ${c}`, 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.msg || 'Could not parse. Try: "Coffee $4.50"', 'error');
    } finally {
      setNlParsing(false);
    }
  };


  // ── Savings Goal handlers ──────────────────────
  const saveGoal = () => {
    if (!goalName || !goalTarget || parseFloat(goalTarget) <= 0) return;
    const newGoal: Goal = {
      id: Date.now().toString(),
      name: goalName,
      target: parseFloat(goalTarget),
      saved: parseFloat(goalSaved) || 0,
      deadline: goalDeadline,
      emoji: goalEmoji,
    };
    setGoals(prev => [...prev, newGoal]);
    setGoalName(''); setGoalTarget(''); setGoalSaved('');
    setGoalDeadline(''); setGoalEmoji('🎯');
    setShowGoalModal(false);
    showToast(`Goal created: ${newGoal.name}`, 'success');
  };

  const deleteGoal = (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    showToast('Goal removed', 'success');
  };

  const addToGoal = (id: string) => {
    const amt = parseFloat(goalAddAmount);
    if (!amt || amt <= 0) return;
    setGoals(prev => prev.map(g => g.id === id ? { ...g, saved: Math.min(g.saved + amt, g.target) } : g));
    setGoalAddAmount(''); setGoalAddId('');
    showToast(`Added $${amt.toFixed(2)} to goal!`, 'success');
  };

  // ── Receipt scan handler ───────────────────────
  const handleReceiptScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptScanning(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api.post('/scan-receipt', {
        image: base64,
        media_type: file.type || 'image/jpeg',
      });
      const { amount: a, description: d, category: c } = res.data;
      setAmount(String(a));
      setDescription(d);
      setCategory(c);
      showToast(`Receipt scanned: ${d} · $${a}`, 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.msg || 'Could not read receipt', 'error');
    } finally {
      setReceiptScanning(false);
      if (receiptInputRef.current) receiptInputRef.current.value = '';
    }
  };

  // ── Email digest handler ────────────────────────
  const saveDigestEmail = async () => {
    if (!digestEmail.trim()) return;
    setDigestSaving(true);
    try {
      await api.post('/subscribe-digest', { email: digestEmail });
      localStorage.setItem('digestEmail', digestEmail);
      setShowDigestModal(false);
      showToast('Weekly digest subscribed!', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.msg || 'Failed to subscribe', 'error');
    } finally {
      setDigestSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    navigate('/');
  };

  const generateReport = async () => {
    if (expenses.length === 0) {
      setReportError('Add some expenses first before generating a report.');
      return;
    }
    setReportLoading(true);
    setReportError('');
    setReport(null);
    try {
      const res = await api.post('/generate-report', {});
      setReport(res.data);
    } catch (err: any) {
      setReportError(err?.response?.data?.msg || 'Failed to generate report. Please try again.');
    } finally {
      setReportLoading(false);
    }
  };

  const downloadReportPDF = () => {
    if (!report) return;
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Financial Report - ${report.report_label}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #fff; color: #1e1e2e; padding: 48px; max-width: 800px; margin: 0 auto; }
    .cover { text-align: center; padding: 60px 0 40px; border-bottom: 2px solid #6366f1; margin-bottom: 40px; }
    .cover h1 { font-size: 2rem; font-weight: 800; color: #1e1e2e; }
    .cover p { color: #64748b; margin-top: 8px; }
    .stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 36px; }
    .stat { background: #f8f9fc; border-radius: 12px; padding: 16px; text-align: center; }
    .stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; font-weight: 600; margin-bottom: 6px; }
    .stat-val { font-size: 1.5rem; font-weight: 800; color: #6366f1; }
    .cats { margin-bottom: 36px; }
    .cat-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .cat-bar-bg { flex: 1; height: 6px; background: #e8eaf2; border-radius: 4px; margin: 0 12px; overflow: hidden; }
    .cat-bar-fill { height: 100%; background: linear-gradient(90deg,#6366f1,#8b5cf6); border-radius: 4px; }
    .narrative h2 { font-size: 1.1rem; font-weight: 700; color: #6366f1; margin: 28px 0 10px; }
    .narrative p { line-height: 1.7; color: #334155; font-size: 0.9rem; }
    .narrative ul { padding-left: 20px; margin-top: 8px; }
    .narrative ul li { line-height: 1.7; color: #334155; font-size: 0.9rem; margin-bottom: 4px; }
    .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #e8eaf2; text-align: center; color: #94a3b8; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>💰 Financial Report</h1>
    <p>${report.report_label} &nbsp;·&nbsp; ${report.username}</p>
    <p style="margin-top:4px;font-size:0.8rem;color:#94a3b8;">Generated ${new Date(report.generated_at).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-label">Total Spent</div><div class="stat-val">$${report.total.toFixed(2)}</div></div>
    <div class="stat"><div class="stat-label">vs Last Month</div><div class="stat-val" style="color:${report.mom_pct > 0 ? '#ef4444' : '#10b981'}">${report.mom_pct !== null ? (report.mom_pct > 0 ? '+' : '') + report.mom_pct + '%' : 'N/A'}</div></div>
    <div class="stat"><div class="stat-label">Avg Daily</div><div class="stat-val">$${report.avg_daily.toFixed(2)}</div></div>
  </div>
  <div class="cats">
    ${Object.entries(report.category_totals as Record<string,number>).map(([cat, amt]) => {
      const pct = Math.round((amt as number / report.total) * 100);
      return `<div class="cat-row"><span style="width:110px;font-size:0.85rem;font-weight:600">${cat}</span><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${pct}%"></div></div><span style="font-size:0.85rem;font-weight:700;color:#6366f1">$${(amt as number).toFixed(2)}</span></div>`;
    }).join('')}
  </div>
  <div class="narrative">
    ${report.narrative
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/gs, (m: string) => '<ul>' + m + '</ul>')
      .split('\n').map((l: string) => l.trim() && !l.startsWith('<') ? '<p>' + l + '</p>' : l).join('\n')
    }
  </div>
  <div class="footer">FinanceAI &nbsp;·&nbsp; AI-Powered Financial Report &nbsp;·&nbsp; Confidential</div>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `FinanceReport_${report.report_label.replace(' ','_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Report downloaded!', 'success');
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
      const res = await api.post('/chat', {
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        context: spendingSummary
      });
      const reply = res.data?.reply || "Sorry, couldn't respond right now.";
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      console.error('Chat error:', err?.response?.data || err?.message || err);
      const msg = err?.response?.data?.msg || 'Something went wrong. Please try again.';
      setChatMessages(prev => [...prev, { role: 'assistant', content: msg }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── CSS VARIABLES: light / dark ── */
        .dash-root {
          --bg:           #eef0f7;
          --bg2:          #e4e6f0;
          --card-bg:      #ffffff;
          --card-border:  #e8eaf2;
          --text:         #1e1e2e;
          --text2:        #64748b;
          --text3:        #94a3b8;
          --inp-bg:       #f8f9fc;
          --inp-border:   #e2e6f0;
          --tab-bg:       #e8eaf2;
          --tab-on:       #ffffff;
          --stat-bg:      #f8f9fc;
          --stat-border:  #e8eaf2;
          --recent-bg:    #f8f9fc;
          --recent-border:#f0f2f8;
          --recent-hover: #eef2ff;
          --table-border: #f1f3f9;
          --table-hover:  #fafbff;
          --chat-bg:      #ffffff;
          --chat-msg-bg:  #fafbff;
          --chat-border:  #e2e8f0;
          --ai-bg:        #ffffff;
          --ai-border:    #c7d2fe;
          --scrollbar:    #e2e8f0;
          --fquote-bg:    rgba(255,255,255,0.88);
          --fquote-color: rgba(79,70,229,0.75);
          --fquote-border:rgba(99,102,241,0.22);
          font-family: 'Plus Jakarta Sans', sans-serif;
          background: var(--bg);
          min-height: 100vh;
          color: var(--text);
          position: relative;
          overflow-x: hidden;
          transition: background 0.3s, color 0.3s;
        }

        .dash-root.dark {
          --bg:           #0f1117;
          --bg2:          #161b27;
          --card-bg:      #1a1f2e;
          --card-border:  #2a3045;
          --text:         #e8eaf6;
          --text2:        #8892b0;
          --text3:        #4a5568;
          --inp-bg:       #141824;
          --inp-border:   #2a3045;
          --tab-bg:       #141824;
          --tab-on:       #1e2435;
          --stat-bg:      #141824;
          --stat-border:  #2a3045;
          --recent-bg:    #141824;
          --recent-border:#2a3045;
          --recent-hover: #1e2a45;
          --table-border: #1e2435;
          --table-hover:  #1a2035;
          --chat-bg:      #1a1f2e;
          --chat-msg-bg:  #141824;
          --chat-border:  #2a3045;
          --ai-bg:        #1a1f2e;
          --ai-border:    #3730a3;
          --scrollbar:    #2a3045;
          --fquote-bg:    rgba(26,31,46,0.92);
          --fquote-color: rgba(165,180,252,0.9);
          --fquote-border:rgba(99,102,241,0.35);
        }

        .dash-root > * { position: relative; z-index: 1; }
        .dash-root > .quote-field { z-index: 20; }

        /* ── BUBBLE QUOTE FIELD ── */
        .quote-field {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 20;
          overflow: hidden;
        }

        .fquote {
          position: absolute;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--fquote-color);
          background: var(--fquote-bg);
          border: 1px solid var(--fquote-border);
          border-radius: 22px;
          padding: 8px 16px;
          box-shadow: 0 4px 18px rgba(99,102,241,0.1), 0 1px 4px rgba(0,0,0,0.05);
          white-space: nowrap;
          backdrop-filter: blur(6px);
          animation: bubblePop cubic-bezier(0.34,1.28,0.64,1) forwards;
          will-change: transform, opacity;
          transform-origin: bottom center;
        }

        @keyframes bubblePop {
          0%   { opacity: 0;   transform: translateY(20px) scale(0.75); }
          15%  { opacity: 1;   transform: translateY(-4px) scale(1.04); }
          25%  { opacity: 1;   transform: translateY(0px)  scale(1);    }
          70%  { opacity: 1;   transform: translateY(-8px) scale(1);    }
          88%  { opacity: 0.6; transform: translateY(-16px) scale(0.97); }
          100% { opacity: 0;   transform: translateY(-28px) scale(0.92); }
        }

        /* ── HERO (unchanged — always dark) ── */
        .hero {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #1a1060 0%, #2d1b8e 40%, #1e0f6e 70%, #160e55 100%);
          border-radius: 28px;
          padding: 48px 52px;
          margin-bottom: 24px;
        }

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
          position: absolute; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Outfit', sans-serif; font-weight: 700;
          color: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.03);
          pointer-events: none; user-select: none;
          animation: floatBubble ease-in-out infinite;
        }

        @keyframes floatBubble {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }

        .hero-content { position: relative; z-index: 1; }
        .hero-label { font-family:'Plus Jakarta Sans',sans-serif; font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.14em; color:rgba(255,255,255,0.45); margin-bottom:10px; }
        .total-amount { font-family:'Outfit',sans-serif; font-weight:800; font-size:clamp(3.2rem,6vw,5rem); color:#fff; letter-spacing:-0.02em; line-height:1; margin-bottom:32px; text-shadow:0 2px 40px rgba(139,92,246,0.4); }
        .total-amount .dollar-sign { font-size:0.6em; vertical-align:super; opacity:0.7; margin-right:2px; }
        .hero-stats { display:flex; gap:40px; flex-wrap:wrap; }
        .hero-stat-label { font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.38); margin-bottom:5px; }
        .hero-stat-val { font-family:'Outfit',sans-serif; font-weight:700; font-size:1.35rem; color:rgba(255,255,255,0.92); letter-spacing:-0.01em; }
        .hero-stat-val.up   { color: #fca5a5; }
        .hero-stat-val.down { color: #6ee7b7; }
        .hero-stat-val.neu  { color: rgba(255,255,255,0.85); }

        /* ── HEADER ── */
        .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; }
        .brand-name { font-family:'Outfit',sans-serif; font-weight:800; font-size:1.55rem; color:var(--text); letter-spacing:-0.02em; transition:color 0.3s; }
        .brand-sub { font-size:0.76rem; color:var(--text3); margin-top:2px; font-weight:400; transition:color 0.3s; }

        /* ── DARK MODE TOGGLE ── */
        .dm-toggle {
          width: 44px; height: 24px;
          background: var(--inp-bg);
          border: 1.5px solid var(--inp-border);
          border-radius: 12px;
          cursor: pointer;
          position: relative;
          transition: background 0.25s, border-color 0.25s;
          flex-shrink: 0;
        }
        .dm-toggle.on { background: #6366f1; border-color: #6366f1; }
        .dm-toggle::after {
          content: '';
          position: absolute;
          top: 2px; left: 2px;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: #fff;
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        }
        .dm-toggle.on::after { transform: translateX(20px); }

        /* ── TABS ── */
        .tab-bar { display:flex; gap:4px; margin-bottom:20px; background:var(--tab-bg); padding:4px; border-radius:14px; width:fit-content; transition:background 0.3s; }
        .tab-btn { padding:8px 20px; border-radius:10px; font-size:0.84rem; font-weight:600; cursor:pointer; border:none; background:transparent; color:var(--text2); font-family:'Plus Jakarta Sans',sans-serif; transition:all 0.18s; }
        .tab-btn.on { background:var(--tab-on); color:var(--text); box-shadow:0 2px 8px rgba(0,0,0,0.1); }
        .tab-btn:hover:not(.on) { color:var(--text); background:rgba(255,255,255,0.08); }

        /* ── CARDS ── */
        .card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:20px; padding:28px; box-shadow:0 1px 4px rgba(0,0,0,0.04),0 4px 16px rgba(0,0,0,0.03); transition:background 0.3s,border-color 0.3s; }
        .card-title { font-family:'Plus Jakarta Sans',sans-serif; font-size:0.78rem; font-weight:700; color:var(--text3); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:20px; }

        /* ── INPUTS ── */
        .inp { background:var(--inp-bg); border:1.5px solid var(--inp-border); color:var(--text); border-radius:14px; padding:13px 16px; font-size:0.9rem; width:100%; outline:none; transition:border-color 0.18s,box-shadow 0.18s,background 0.3s; font-family:'Plus Jakarta Sans',sans-serif; }
        .inp::placeholder { color:var(--text3); }
        .inp:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.12); background:var(--card-bg); }

        .sel { background:var(--inp-bg); border:1.5px solid var(--inp-border); color:var(--text); border-radius:14px; padding:13px 16px; font-size:0.9rem; width:100%; outline:none; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; font-weight:500; appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M6 8L0 0h12z'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 14px center; padding-right:38px; transition:border-color 0.18s,box-shadow 0.18s,background 0.3s; }
        .sel:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.12); background-color:var(--card-bg); outline:none; }
        .sel option { background:var(--card-bg); color:var(--text); }

        /* ── BUTTONS ── */
        .btn-primary { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; font-weight:700; padding:13px 24px; border-radius:14px; border:none; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; font-size:0.9rem; white-space:nowrap; transition:opacity 0.18s,transform 0.12s,box-shadow 0.18s; box-shadow:0 4px 14px rgba(99,102,241,0.35); }
        .btn-primary:hover { opacity:0.9; transform:translateY(-1px); box-shadow:0 6px 18px rgba(99,102,241,0.45); }
        .btn-primary:active { transform:translateY(0); }

        .btn-outline { background:transparent; color:#6366f1; padding:9px 18px; border-radius:12px; border:1.5px solid #c7d2fe; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; font-size:0.82rem; font-weight:600; transition:all 0.18s; display:inline-flex; align-items:center; gap:5px; }
        .btn-outline:hover { background:#eef2ff; border-color:#6366f1; }
        .dark .btn-outline { border-color:#3730a3; }
        .dark .btn-outline:hover { background:rgba(99,102,241,0.15); }

        .btn-ghost-red { background:#fff0f0; color:#ef4444; border:1.5px solid #fecaca; padding:9px 18px; border-radius:12px; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; font-size:0.82rem; font-weight:600; transition:all 0.18s; }
        .btn-ghost-red:hover { background:#fee2e2; }
        .dark .btn-ghost-red { background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.3); }
        .dark .btn-ghost-red:hover { background:rgba(239,68,68,0.18); }

        /* ── AI SUGGESTION ── */
        .ai-suggestion { position:absolute; left:0; right:0; top:calc(100% + 6px); z-index:20; padding:10px 12px; background:var(--ai-bg); border:1.5px solid var(--ai-border); border-radius:14px; display:flex; align-items:center; gap:10px; box-shadow:0 6px 20px rgba(99,102,241,0.14); }

        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.85)} }

        /* ── TABLE ── */
        .exp-table { width:100%; border-collapse:collapse; }
        .exp-table th { padding:11px 16px; text-align:left; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.09em; color:var(--text3); font-weight:600; border-bottom:1.5px solid var(--table-border); font-family:'Plus Jakarta Sans',sans-serif; }
        .exp-table td { padding:14px 16px; border-bottom:1px solid var(--table-border); font-size:0.9rem; }
        .exp-table tr:last-child td { border-bottom:none; }
        .exp-table tbody tr:hover td { background:var(--table-hover); }
        .cat-badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:0.74rem; font-weight:600; }

        /* ── MONTHLY ── */
        .month-col { display:flex; flex-direction:column; align-items:center; gap:6px; flex:1; min-width:40px; }
        .month-bar-bg { width:100%; background:var(--inp-bg); border-radius:8px 8px 4px 4px; display:flex; align-items:flex-end; height:110px; overflow:hidden; }
        .month-bar-fill { width:100%; transition:height 0.9s cubic-bezier(0.4,0,0.2,1); border-radius:8px 8px 0 0; }

        /* ── STAT MINI ── */
        .stat-mini { background:var(--stat-bg); border:1px solid var(--stat-border); border-radius:14px; padding:18px 20px; transition:background 0.3s; }
        .stat-mini-label { font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.09em; color:var(--text3); margin-bottom:6px; }
        .stat-mini-val { font-family:'Outfit',sans-serif; font-weight:700; font-size:1.4rem; color:var(--text); letter-spacing:-0.01em; }

        /* ── RECENT ── */
        .recent-item { display:flex; justify-content:space-between; align-items:center; padding:13px 14px; background:var(--recent-bg); border-radius:13px; border:1px solid var(--recent-border); transition:background 0.15s,border-color 0.15s; margin-bottom:8px; }
        .recent-item:hover { background:var(--recent-hover); border-color:#c7d2fe; }
        .recent-item:last-child { margin-bottom:0; }

        /* ── CHAT ── */
        .chat-window { position:fixed; bottom:92px; right:22px; width:355px; max-height:490px; display:flex; flex-direction:column; background:var(--chat-bg); border:1px solid var(--chat-border); border-radius:22px; box-shadow:0 20px 50px rgba(0,0,0,0.15),0 0 0 1px rgba(99,102,241,0.08); z-index:200; overflow:hidden; animation:chatSlide 0.22s cubic-bezier(0.34,1.56,0.64,1); transition:background 0.3s; }
        @keyframes chatSlide { from{opacity:0;transform:translateY(20px) scale(0.95)} to{opacity:1;transform:none} }
        .chat-head { padding:14px 16px; background:linear-gradient(135deg,#1a1060,#2d1b8e); display:flex; align-items:center; justify-content:space-between; }
        .chat-msgs { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; background:var(--chat-msg-bg); scrollbar-width:thin; scrollbar-color:var(--scrollbar) transparent; transition:background 0.3s; }
        .msg-u { align-self:flex-end; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; padding:10px 14px; border-radius:16px 16px 4px 16px; font-size:0.85rem; max-width:80%; line-height:1.45; font-family:'Plus Jakarta Sans',sans-serif; }
        .msg-a { align-self:flex-start; background:var(--card-bg); color:var(--text); padding:10px 14px; border-radius:16px 16px 16px 4px; font-size:0.85rem; max-width:85%; line-height:1.5; border:1px solid var(--card-border); box-shadow:0 1px 4px rgba(0,0,0,0.05); font-family:'Plus Jakarta Sans',sans-serif; transition:background 0.3s; }
        .chat-foot { padding:10px 12px; border-top:1px solid var(--table-border); display:flex; gap:8px; background:var(--chat-bg); transition:background 0.3s; }

        .fab { position:fixed; bottom:24px; right:22px; width:56px; height:56px; background:linear-gradient(135deg,#6366f1,#8b5cf6); border-radius:18px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 8px 24px rgba(99,102,241,0.4); border:none; transition:transform 0.18s,box-shadow 0.18s; z-index:199; font-size:1.35rem; }
        .fab:hover { transform:scale(1.08) translateY(-2px); box-shadow:0 12px 30px rgba(99,102,241,0.55); }

        .dot { width:5px; height:5px; background:#6366f1; border-radius:50%; display:inline-block; animation:dotB 1.1s ease-in-out infinite; }
        .dot:nth-child(2){animation-delay:.18s} .dot:nth-child(3){animation-delay:.36s}
        @keyframes dotB{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-5px);opacity:1}}

        /* ── MISC ── */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 4px; }
      `}</style>

      <div className={`dash-root${darkMode ? ' dark' : ''}`}>

        {/* ── BUBBLE FINANCIAL QUOTES ── */}
        <QuoteBubbles />
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 110px' }}>

          {/* ── PAGE HEADER ── */}
          <div className="page-header">
            <div>
              <div className="brand-name">💰 FinanceAI</div>
              <div className="brand-sub">Your intelligent money companion{username ? <span style={{ color: '#6366f1', fontWeight: 600, marginLeft: 8 }}>· Welcome back, {username}!</span> : null}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-outline" onClick={exportCSV}>↓ Export CSV</button>
              <button className="btn-outline" onClick={() => setShowDigestModal(true)} title="Weekly email digest">📧</button>
              <label className="btn-outline" style={{ cursor: receiptScanning ? 'wait' : 'pointer', position: 'relative' }} title="Scan a receipt">
                {receiptScanning ? '⏳' : '📷'}
                <input ref={receiptInputRef} type="file" accept="image/*" onChange={handleReceiptScan} style={{ display: 'none' }} />
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', background: 'var(--inp-bg)', border: '1.5px solid var(--inp-border)', borderRadius: 12 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text2)', userSelect: 'none' }}>
                  {darkMode ? '🌙' : '☀️'}
                </span>
                <button
                  className={`dm-toggle${darkMode ? ' on' : ''}`}
                  onClick={() => setDarkMode(p => !p)}
                  title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                />
              </div>
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
            {(['overview','monthly','expenses','report','budgets','goals'] as const).map(t => (
              <button key={t} className={`tab-btn ${activeTab === t ? 'on' : ''}`} onClick={() => setActiveTab(t)}>
                {t === 'overview' ? '📊 Overview' : t === 'monthly' ? '📅 Monthly' : t === 'expenses' ? '📋 All Expenses' : t === 'report' ? '📄 AI Report' : t === 'budgets' ? '🎯 Budgets' : '🏆 Goals'}
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
                  <p style={{ color: 'var(--text3)', textAlign: 'center', padding: '32px 0', fontSize: '0.875rem' }}>Add expenses to see breakdown</p>
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
                              <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {exp.description}
                              {recurringMap[exp.description.toLowerCase().trim()] && (
                                <span title="Recurring expense" style={{ fontSize: '0.65rem', background: '#eef2ff', color: '#6366f1', border: '1px solid #c7d2fe', borderRadius: 20, padding: '1px 7px', fontWeight: 700 }}>🔁 recurring</span>
                              )}
                            </p>
                              <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>{new Date(exp.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>${exp.amount.toFixed(2)}</p>
                            <span style={{ fontSize: '0.7rem', color: col, fontWeight: 600 }}>{exp.category}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text3)', textAlign: 'center', padding: '32px 0', fontSize: '0.875rem' }}>No expenses yet</p>
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
                          <p style={{ fontFamily: 'Outfit,sans-serif', color: isCurr ? '#6366f1' : 'var(--text3)', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            ${val >= 1000 ? (val/1000).toFixed(1)+'k' : val.toFixed(0)}
                          </p>
                          <div className="month-bar-bg">
                            <div className="month-bar-fill" style={{ height: `${h}%`, background: isCurr ? 'linear-gradient(180deg,#8b5cf6,#6366f1)' : 'linear-gradient(180deg,#a5b4fc,#818cf8)' }} />
                          </div>
                          <p style={{ color: isCurr ? '#6366f1' : 'var(--text3)', fontSize: '0.68rem', fontWeight: isCurr ? 700 : 400, whiteSpace: 'nowrap' }}>{mon}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text3)', textAlign: 'center', padding: '40px 0', fontSize: '0.875rem' }}>No data yet</p>
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

          {/* ── REPORT TAB ── */}
          {activeTab === 'report' && (
            <div style={{ marginBottom: 20 }}>
              {/* Generate button */}
              {!report && !reportLoading && (
                <div className="card" style={{ textAlign: 'center', padding: '52px 28px' }}>
                  <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>📊</div>
                  <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text)', marginBottom: 10 }}>AI Monthly Report</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 420, margin: '0 auto 28px', lineHeight: 1.6 }}>
                    Claude analyses your spending and generates a personalised financial report with insights, trends, and actionable recommendations.
                  </p>
                  {reportError && <p style={{ color: '#f87171', marginBottom: 16, fontSize: '0.875rem' }}>{reportError}</p>}
                  <button className="btn-primary" onClick={generateReport} style={{ fontSize: '1rem', padding: '14px 36px' }}>
                    ✨ Generate My Report
                  </button>
                </div>
              )}

              {/* Loading state */}
              {reportLoading && (
                <div className="card" style={{ textAlign: 'center', padding: '64px 28px' }}>
                  <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
                    <span className="dot" /><span className="dot" /><span className="dot" />
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Claude is analysing your spending…</p>
                  <p style={{ color: 'var(--text-faint)', fontSize: '0.78rem', marginTop: 6 }}>This takes about 10–15 seconds</p>
                </div>
              )}

              {/* Report content */}
              {report && !reportLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {/* Report header */}
                  <div className="card" style={{ background: 'linear-gradient(135deg,#1a1060,#2d1b8e)', border: 'none', color: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                      <div>
                        <p style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>AI Financial Report</p>
                        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.8rem', letterSpacing: '-0.02em' }}>{report.report_label}</h2>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', marginTop: 4 }}>Generated for {report.username} · {new Date(report.generated_at).toLocaleDateString()}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-primary" onClick={downloadReportPDF} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.82rem', padding: '9px 16px' }}>
                          ↓ Download
                        </button>
                        <button className="btn-outline" onClick={() => setReport(null)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.82rem' }}>
                          ↺ Regenerate
                        </button>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 14, marginTop: 28 }}>
                      {[
                        { label: 'Total Spent', val: `$${report.total.toFixed(2)}`, color: '#c4b5fd' },
                        { label: 'vs Last Month', val: report.mom_pct !== null ? `${report.mom_pct > 0 ? '+' : ''}${report.mom_pct}%` : 'N/A', color: report.mom_pct > 0 ? '#fca5a5' : '#6ee7b7' },
                        { label: 'Daily Avg', val: `$${report.avg_daily.toFixed(2)}`, color: '#93c5fd' },
                        { label: 'Transactions', val: report.tx_count, color: '#a5f3fc' },
                      ].map((s, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px' }}>
                          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{s.label}</div>
                          <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: '1.3rem', color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Category breakdown */}
                  <div className="card">
                    <div className="card-title">Spending Breakdown</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                      {Object.entries(report.category_totals as Record<string,number>).map(([cat, amt], i) => {
                        const pct = Math.round((amt as number / report.total) * 100);
                        const col = CATEGORY_COLORS[cat] || '#6b7280';
                        return (
                          <div key={i}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.86rem' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--text)' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, display: 'inline-block' }} />{cat}
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>${(amt as number).toFixed(2)} <span style={{ color: 'var(--text-faint)' }}>({pct}%)</span></span>
                            </div>
                            <div style={{ height: 5, background: 'var(--bg-month-bar)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 4, opacity: 0.85, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI Narrative */}
                  <div className="card">
                    <div className="card-title">AI Analysis</div>
                    <div style={{ lineHeight: 1.75, color: 'var(--text-sub)', fontSize: '0.9rem' }}>
                      {report.narrative.split('\n').map((line: string, i: number) => {
                        if (line.startsWith('## ')) return <h3 key={i} style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: '1rem', color: '#6366f1', margin: '22px 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{line.replace('## ','')}</h3>;
                        if (line.startsWith('- ')) return <p key={i} style={{ paddingLeft: 16, borderLeft: '2px solid #c7d2fe', marginBottom: 8, color: 'var(--text-sub)' }}>{'• ' + line.slice(2)}</p>;
                        if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
                        return <p key={i} style={{ marginBottom: 8 }}>{line}</p>;
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}


          {/* ── BUDGETS TAB ── */}
          {activeTab === 'budgets' && (
            <div style={{ marginBottom: 20 }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                  <div className="card-title" style={{ margin: 0 }}>Monthly Budget Caps</div>
                  <button className="btn-primary" onClick={() => setShowBudgetModal(true)} style={{ fontSize: '0.82rem', padding: '8px 18px' }}>
                    + Set Budget
                  </button>
                </div>

                {Object.keys(budgets).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '44px 0' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎯</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 6 }}>No budgets set yet</p>
                    <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>Set a monthly cap per category to track your limits</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {CATEGORIES.filter(cat => budgets[cat]).map(cat => {
                      const col = CATEGORY_COLORS[cat] || '#6b7280';
                      const limit = budgets[cat];
                      const currentMonth = new Date().toISOString().slice(0, 7);
                      const spent = expenses
                        .filter(e => e.category === cat && e.date.startsWith(currentMonth))
                        .reduce((s, e) => s + e.amount, 0);
                      const pct = Math.min((spent / limit) * 100, 100);
                      const over = spent > limit;
                      const warn = !over && pct >= 80;
                      const statusColor = over ? '#ef4444' : warn ? '#f59e0b' : '#10b981';
                      return (
                        <div key={cat} style={{ padding: '16px 18px', background: 'var(--bg-input)', borderRadius: 14, border: `1.5px solid ${over ? '#fecaca' : warn ? '#fde68a' : 'var(--border)'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <div style={{ width: 10, height: 10, borderRadius: '50%', background: col, flexShrink: 0 }} />
                              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>{cat}</span>
                              {over && <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>OVER BUDGET</span>}
                              {warn && <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>NEAR LIMIT</span>}
                            </div>
                            <button onClick={() => removeBudget(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: '0.75rem', padding: '2px 6px', borderRadius: 6, fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                              onMouseLeave={e => e.currentTarget.style.color = ''}>
                              Remove
                            </button>
                          </div>

                          <div style={{ height: 8, background: 'var(--bg-month-bar)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: statusColor, borderRadius: 6, transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                            <span style={{ color: statusColor, fontWeight: 600 }}>${spent.toFixed(2)} spent</span>
                            <span style={{ color: 'var(--text-faint)' }}>
                              {over
                                ? <span style={{ color: '#ef4444' }}>Over by ${(spent - limit).toFixed(2)}</span>
                                : <span>${(limit - spent).toFixed(2)} remaining of ${limit}</span>
                              }
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recurring Summary Card */}
              {Object.keys(recurringMap).length > 0 && (
                <div className="card" style={{ marginTop: 18 }}>
                  <div className="card-title">🔁 Recurring Expenses Detected</div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                    These appear across multiple months — review whether each is still needed.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.keys(recurringMap).map(desc => {
                      const matches = expenses.filter(e => e.description.toLowerCase().trim() === desc);
                      const avgAmount = matches.reduce((s, e) => s + e.amount, 0) / matches.length;
                      const cat = matches[0]?.category || 'Other';
                      const col = CATEGORY_COLORS[cat] || '#6b7280';
                      return (
                        <div key={desc} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 11, border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: '0.9rem' }}>🔁</span>
                            <div>
                              <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', textTransform: 'capitalize' }}>{desc}</p>
                              <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 1 }}>{matches.length}× · avg ${avgAmount.toFixed(2)}/mo</p>
                            </div>
                          </div>
                          <span className="cat-badge" style={{ background: `${col}18`, color: col, border: `1px solid ${col}30`, fontSize: '0.7rem' }}>{cat}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}


          {/* ── GOALS TAB ── */}
          {activeTab === 'goals' && (
            <div style={{ marginBottom: 20 }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                  <div className="card-title" style={{ margin: 0 }}>🏆 Savings Goals</div>
                  <button className="btn-primary" onClick={() => setShowGoalModal(true)} style={{ fontSize: '0.82rem', padding: '8px 18px' }}>+ New Goal</button>
                </div>

                {goals.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '44px 0' }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>🏆</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 6 }}>No savings goals yet</p>
                    <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>Set a goal — holiday, emergency fund, new laptop — and track progress here</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16 }}>
                    {goals.map(goal => {
                      const pct = Math.min((goal.saved / goal.target) * 100, 100);
                      const done = goal.saved >= goal.target;
                      const remaining = Math.max(goal.target - goal.saved, 0);
                      const daysLeft = goal.deadline
                        ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000)
                        : null;
                      const monthsLeft = daysLeft !== null ? Math.max(Math.ceil(daysLeft / 30), 1) : null;
                      const reqPerMonth = monthsLeft && remaining > 0 ? remaining / monthsLeft : null;

                      return (
                        <div key={goal.id} style={{ background: 'var(--bg-input)', border: `1.5px solid ${done ? '#6ee7b7' : 'var(--border)'}`, borderRadius: 16, padding: '20px', position: 'relative' }}>
                          {done && <div style={{ position: 'absolute', top: 12, right: 12, fontSize: '1.2rem' }}>✅</div>}

                          <div style={{ fontSize: '2rem', marginBottom: 8 }}>{goal.emoji}</div>
                          <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: 4 }}>{goal.name}</p>

                          {/* Progress ring + amounts */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                            <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
                              <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }} viewBox="0 0 42 42">
                                <circle cx="21" cy="21" r="16" fill="none" stroke="var(--bg-month-bar)" strokeWidth="4" />
                                <circle cx="21" cy="21" r="16" fill="none"
                                  stroke={done ? '#10b981' : pct >= 75 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#94a3b8'}
                                  strokeWidth="4"
                                  strokeDasharray={`${pct}, 100`}
                                  strokeLinecap="round"
                                  style={{ transition: 'all 0.8s' }}
                                />
                              </svg>
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text)' }}>
                                {Math.round(pct)}%
                              </div>
                            </div>
                            <div>
                              <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text)', margin: 0 }}>${goal.saved.toFixed(2)}</p>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', margin: 0 }}>of ${goal.target.toFixed(2)}</p>
                              {goal.deadline && (
                                <p style={{ fontSize: '0.7rem', color: daysLeft !== null && daysLeft < 30 ? '#ef4444' : 'var(--text-faint)', margin: '2px 0 0', fontWeight: 600 }}>
                                  {daysLeft !== null && daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Due today!' : 'Past deadline'}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div style={{ height: 5, background: 'var(--bg-month-bar)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: done ? '#10b981' : 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: 4, transition: 'width 0.9s' }} />
                          </div>

                          {/* Required per month */}
                          {reqPerMonth && !done && (
                            <p style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 600, marginBottom: 10 }}>
                              Save ${reqPerMonth.toFixed(0)}/mo to hit your deadline
                            </p>
                          )}

                          {/* Add funds row */}
                          {!done && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              {goalAddId === goal.id ? (
                                <>
                                  <input
                                    type="number" step="0.01" placeholder="Amount"
                                    value={goalAddAmount} onChange={e => setGoalAddAmount(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addToGoal(goal.id)}
                                    className="inp" style={{ padding: '7px 12px', fontSize: '0.82rem', flex: 1 }}
                                    autoFocus
                                  />
                                  <button onClick={() => addToGoal(goal.id)} className="btn-primary" style={{ padding: '7px 14px', fontSize: '0.82rem' }}>Add</button>
                                  <button onClick={() => { setGoalAddId(''); setGoalAddAmount(''); }} style={{ padding: '7px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--text-faint)', fontSize: '0.82rem' }}>✕</button>
                                </>
                              ) : (
                                <button onClick={() => setGoalAddId(goal.id)} className="btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '7px' }}>
                                  + Add Funds
                                </button>
                              )}
                            </div>
                          )}

                          {done && (
                            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 10, padding: '8px 12px', textAlign: 'center', fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                              🎉 Goal reached!
                            </div>
                          )}

                          <button onClick={() => deleteGoal(goal.id)} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', width: '100%', textAlign: 'right' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = ''}>
                            Remove goal
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ADD EXPENSE (always visible) ── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div className="card-title" style={{ margin: 0 }}>Add Expense</div>
              <button
                type="button"
                onClick={() => { setNlMode(m => !m); setNlInput(''); }}
                style={{ fontSize: '0.78rem', fontWeight: 600, padding: '6px 14px', borderRadius: 10, border: '1.5px solid #c7d2fe', background: nlMode ? '#6366f1' : 'transparent', color: nlMode ? '#fff' : '#6366f1', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'all 0.18s' }}
              >
                {nlMode ? '✕ Cancel' : '✨ Quick Add'}
              </button>
            </div>

            {/* Natural Language Input */}
            {nlMode && (
              <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg-input)', border: '1.5px solid #c7d2fe', borderRadius: 14, padding: '10px 14px' }}>
                <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>✨</span>
                <input
                  type="text"
                  value={nlInput}
                  onChange={e => setNlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNLSubmit()}
                  placeholder='Try: "Coffee at Starbucks $4.50" or "Uber to airport $28"'
                  className="inp"
                  style={{ border: 'none', background: 'transparent', padding: '4px 0', flex: 1, fontSize: '0.88rem' }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleNLSubmit}
                  disabled={nlParsing || !nlInput.trim()}
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', opacity: nlParsing || !nlInput.trim() ? 0.5 : 1, whiteSpace: 'nowrap', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {nlParsing ? '...' : 'Parse →'}
                </button>
              </div>
            )}
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
              <button className="btn-outline" onClick={() => setShowDigestModal(true)} title="Weekly email digest">📧</button>
              <label className="btn-outline" style={{ cursor: receiptScanning ? 'wait' : 'pointer', position: 'relative' }} title="Scan a receipt">
                {receiptScanning ? '⏳' : '📷'}
                <input ref={receiptInputRef} type="file" accept="image/*" onChange={handleReceiptScan} style={{ display: 'none' }} />
              </label>
              </div>
              {expenses.length === 0 ? (
                <p style={{ color: 'var(--text3)', textAlign: 'center', padding: '44px 0', fontSize: '0.875rem' }}>No expenses yet. Add your first one above!</p>
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
                            <td style={{ color: 'var(--text3)', fontSize: '0.84rem' }}>{new Date(exp.date).toLocaleDateString()}</td>
                            <td style={{ color: 'var(--text)', fontWeight: 500 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {exp.description}
                                {recurringMap[exp.description.toLowerCase().trim()] && (
                                  <span style={{ fontSize: '0.62rem', background: '#eef2ff', color: '#6366f1', border: '1px solid #c7d2fe', borderRadius: 20, padding: '1px 6px', fontWeight: 700 }}>🔁</span>
                                )}
                              </span>
                            </td>
                            <td>
                              <span className="cat-badge" style={{ background: `${col}15`, color: col, border: `1px solid ${col}30` }}>
                                {exp.category}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--text)' }}>${exp.amount.toFixed(2)}</td>
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


        {/* ── BUDGET MODAL ── */}
        {showBudgetModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: '24px', maxWidth: 400, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: 18 }}>🎯 Set Monthly Budget Cap</h3>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Category</label>
                <select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)} className="sel">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Monthly Limit ($)</label>
                <input
                  type="number" step="0.01" placeholder="e.g. 300"
                  value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveBudget()}
                  className="inp" autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveBudget} className="btn-primary" style={{ flex: 1 }}>Save Budget</button>
                <button onClick={() => { setShowBudgetModal(false); setBudgetAmount(''); }} style={{ flex: 1, padding: '13px', borderRadius: 14, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, fontSize: '0.875rem' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}


        {/* ── GOAL MODAL ── */}
        {showGoalModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: 18 }}>🏆 New Savings Goal</h3>

              {/* Emoji picker row */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Icon</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['🎯','✈️','🏠','🚗','💻','📱','🎓','💍','🏖️','🐾','🎸','💪'].map(e => (
                    <button key={e} onClick={() => setGoalEmoji(e)}
                      style={{ width: 36, height: 36, fontSize: '1.2rem', border: `2px solid ${goalEmoji === e ? '#6366f1' : 'var(--border)'}`, borderRadius: 9, background: goalEmoji === e ? '#eef2ff' : 'var(--bg-input)', cursor: 'pointer' }}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Goal Name</label>
                <input type="text" placeholder="e.g. Holiday Fund" value={goalName} onChange={e => setGoalName(e.target.value)} className="inp" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Target ($)</label>
                  <input type="number" step="0.01" placeholder="2000" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} className="inp" />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Already Saved ($)</label>
                  <input type="number" step="0.01" placeholder="0" value={goalSaved} onChange={e => setGoalSaved(e.target.value)} className="inp" />
                </div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Deadline (optional)</label>
                <input type="date" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} className="inp" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveGoal} className="btn-primary" style={{ flex: 1 }}>Create Goal</button>
                <button onClick={() => { setShowGoalModal(false); setGoalName(''); setGoalTarget(''); setGoalSaved(''); setGoalDeadline(''); }} style={{ flex: 1, padding: 13, borderRadius: 14, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, fontSize: '0.875rem' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── EMAIL DIGEST MODAL ── */}
        {showDigestModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: 8 }}>📧 Weekly Email Digest</h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
                Every Monday morning you'll receive a summary of last week's spending, your top category, budget status, and one AI tip.
              </p>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Your Email</label>
                <input type="email" placeholder="you@example.com" value={digestEmail} onChange={e => setDigestEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveDigestEmail()} className="inp" autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveDigestEmail} disabled={digestSaving || !digestEmail.trim()} className="btn-primary" style={{ flex: 1, opacity: digestSaving ? 0.6 : 1 }}>
                  {digestSaving ? 'Saving...' : '✓ Subscribe'}
                </button>
                <button onClick={() => setShowDigestModal(false)} style={{ flex: 1, padding: 13, borderRadius: 14, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, fontSize: '0.875rem' }}>Cancel</button>
              </div>
              {digestEmail && localStorage.getItem('digestEmail') === digestEmail && (
                <p style={{ marginTop: 12, fontSize: '0.75rem', color: '#10b981', textAlign: 'center', fontWeight: 600 }}>✓ Currently subscribed as {digestEmail}</p>
              )}
            </div>
          </div>
        )}

        {/* ── FEEDBACK MODAL ── */}
        {showFeedbackModal && feedbackPredicted && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: '10px 14px', width: 'auto', maxWidth: '95vw', boxShadow: '0 12px 40px rgba(0,0,0,0.14)', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ fontSize: '0.77rem', color: 'var(--text2)', fontFamily: 'Plus Jakarta Sans, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}>
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