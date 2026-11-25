import React, { useEffect, useState } from 'react';

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis
} from 'recharts';

import {
  ShieldCheck, LogOut, Plus, RefreshCw,
  ClipboardList, LayoutDashboard, ShieldAlert,
  FileClock, Menu, X, Activity, UserRound,
  ChevronRight, Users
} from 'lucide-react';

import { api } from './api';

const categories = [
  'Access Control',
  'Data Protection',
  'Infrastructure',
  'Compliance',
  'Other'
];

const severities = [
  'low', 'medium', 'high', 'critical'
];

const statuses = [
  'open', 'in_progress', 'pending_review', 'closed'
];

const colors = [
  '#06b6d4', '#f59e0b', '#ef4444', '#a855f7'
];

const blankReport = {
  title: '',
  description: '',
  category: 'Access Control',
  selfAssign: false
};

const blank = {
  title: '',
  description: '',
  category: 'Access Control',
  severity: 'medium',
  likelihood: 3,
  impact: 3,
  controls: [
    {
      name: 'Document evidence of mitigation',
      implemented: false
    }
  ],
  deadline: '',
  assignedTo: ''
};

function formatStatus(value) {
  return (value || '').replaceAll('_', ' ');
}

function approvedRisk(risk) {
  return !['pending', 'rejected'].includes(
    risk.reviewStatus
  );
}

function MitigationProgress({ controls = [] }) {

  const completed = controls.filter(
    c => c.implemented
  ).length;

  const total = controls.length;

  const progress = total
    ? Math.round(completed / total * 100)
    : 0;

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">

      <div className="mb-2 flex items-center justify-between">

        <span className="text-sm font-semibold">
          Mitigation Progress
        </span>

        <span className="font-bold text-cyan-400">
          {progress}%
        </span>

      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700">

        <div
          className="h-full rounded-full bg-cyan-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />

      </div>

      <p className="mt-2 text-xs text-slate-400">
        {completed} of {total} mitigation controls completed
      </p>

    </div>
  );
}

export default function App() {

  // APPLICATION STATE

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [activeSection, setActiveSection] =
    useState('overview');

  const [token, setToken] = useState(
    () => sessionStorage.getItem('SentriX_token') || ''
  );

  const [user, setUser] = useState(null);

  const [risks, setRisks] = useState([]);

  const [users, setUsers] = useState([]);

  const [selectedRiskId, setSelectedRiskId] =
    useState(null);

  const [riskSearch, setRiskSearch] = useState('');

  const [severityFilter, setSeverityFilter] =
    useState('all');

  const [statusFilter, setStatusFilter] =
    useState('all');

  const [form, setForm] = useState(blank);

  const [editing, setEditing] = useState(null);

  const [logs, setLogs] = useState([]);

  const [logTitle, setLogTitle] = useState('');

  const [error, setError] = useState('');

  const [notice, setNotice] = useState('');

  const [loading, setLoading] = useState(false);

  const [securityEvents, setSecurityEvents] =
    useState([]);

  const [report, setReport] = useState(blankReport);

  const [showReport, setShowReport] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);

  const [aiResult, setAiResult] = useState(null);

  const [
    selectedRecommendations,
    setSelectedRecommendations
  ] = useState([]);

  // AUTHENTICATION STATE

  const [mode, setMode] = useState(
    () => new URLSearchParams(
      window.location.search
    ).has('resetToken')
      ? 'reset'
      : 'login'
  );

  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: ''
  });

  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(
      window.location.search
    ).get('resetToken') || ''
  );

  const [newPassword, setNewPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  // PERSONAL AND ORGANIZATION MODE

  const [accountMode, setAccountMode] =
    useState('personal');

  const [organizationAction, setOrganizationAction] =
    useState('create');

  const [organizationName, setOrganizationName] =
    useState('');

  const [organizationSearch, setOrganizationSearch] =
    useState('');

  const [organizations, setOrganizations] =
    useState([]);

  const [organizationId, setOrganizationId] =
    useState('');

  const [membershipRequests, setMembershipRequests] =
    useState([]);

  const [membershipMessage, setMembershipMessage] =
    useState('');

  const isAdmin = user?.role === 'admin';

  const isPersonal = user?.role === 'personal';

  const isEmployee = user?.role === 'employee';

  const canManageRisks = isAdmin || isPersonal;

  // API REQUEST

  const request = (path, opts = {}) =>
    api(path, { ...opts, token });

  const action = async (fn) => {

    setLoading(true);
    setError('');
    setNotice('');

    try {

      await fn();

    } catch (e) {

      setError(e.message);

    } finally {

      setLoading(false);

    }

  };

  // NAVIGATION

  const navigateTo = (sectionId) => {

    setSelectedRiskId(null);
    setActiveSection(sectionId);
    setSidebarOpen(false);

    requestAnimationFrame(() => {

      document.getElementById(sectionId)
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

    });

  };

  const switchMode = (next) => {

    setError('');
    setNotice('');
    setMembershipMessage('');

    setAuthForm(prev => ({
      ...prev,
      password: ''
    }));

    setMode(next);

  };

  // REFRESH WORKSPACE

  const refresh = async (currentUser = user) => {

    const adminUser = currentUser?.role === 'admin';

    const personalUser =
      currentUser?.role === 'personal';

    const [r, people, events, requests] =
      await Promise.all([

        request('/risks'),

        adminUser
          ? request('/auth/users')
          : Promise.resolve([]),

        adminUser || personalUser
          ? request('/security/events')
          : Promise.resolve([]),

        adminUser
          ? request('/auth/organization/requests')
          : Promise.resolve([])

      ]);

    setRisks(r);
    setUsers(people);
    setSecurityEvents(events);
    setMembershipRequests(requests);

  };

  // RESTORE LOGIN SESSION

  useEffect(() => {

    if (!token) {

      setUser(null);
      return;

    }

    let active = true;

    async function loadWorkspace() {

      try {

        const u = await api('/auth/me', { token });

        if (!active) return;

        const adminUser = u.role === 'admin';

        const personalUser = u.role === 'personal';

        const [r, people, events, requests] =
          await Promise.all([

            api('/risks', { token }),

            adminUser
              ? api('/auth/users', { token })
              : Promise.resolve([]),

            adminUser || personalUser
              ? api('/security/events', { token })
              : Promise.resolve([]),

            adminUser
              ? api(
                '/auth/organization/requests',
                { token }
              )
              : Promise.resolve([])

          ]);

        if (!active) return;

        setUser(u);
        setRisks(r);
        setUsers(people);
        setSecurityEvents(events);
        setMembershipRequests(requests);

      } catch (e) {

        if (!active) return;

        sessionStorage.removeItem('SentriX_token');

        setToken('');
        setUser(null);
        setError(e.message);

      }

    }

    loadWorkspace();

    return () => {
      active = false;
    };

  }, [token]);

  // LOGIN AND REGISTRATION

  const login = async (e) => {

    e.preventDefault();

    await action(async () => {

      if (mode === 'register') {

        const payload = {
          name: authForm.name.trim(),
          email: authForm.email.trim(),
          password: authForm.password,
          accountMode
        };

        if (accountMode === 'organization') {

          payload.organizationAction =
            organizationAction;

          if (organizationAction === 'create') {

            if (organizationName.trim().length < 2) {

              throw new Error(
                'Enter your organization name.'
              );

            }

            payload.organizationName =
              organizationName.trim();

          } else {

            if (!organizationId) {

              throw new Error(
                'Search and select an organization.'
              );

            }

            payload.organizationId = organizationId;

          }

        }

        const data = await api('/auth/register', {

          method: 'POST',

          body: JSON.stringify(payload)

        });

        setAuthForm(prev => ({
          ...prev,
          password: ''
        }));

        if (data.membershipStatus === 'pending') {

          setMembershipMessage(
            'Your request has been submitted. ' +
            'An organization administrator must ' +
            'approve your membership before you can log in.'
          );

          setMode('pending');

        } else {

          setNotice(
            'Account created successfully. Log in now.'
          );

          setMode('login');

        }

        return;

      }

      try {

        const data = await api('/auth/login', {

          method: 'POST',

          body: JSON.stringify({
            email: authForm.email.trim(),
            password: authForm.password
          })

        });

        sessionStorage.setItem(
          'SentriX_token',
          data.token
        );

        setAuthForm(prev => ({
          ...prev,
          password: ''
        }));

        setToken(data.token);

      } catch (e) {

        if (e.membershipStatus === 'pending') {

          setMembershipMessage(
            'Your membership request is awaiting ' +
            'administrator approval.'
          );

          setAuthForm(prev => ({
            ...prev,
            password: ''
          }));

          setMode('pending');

          return;

        }

        if (e.membershipStatus === 'rejected') {

          setMembershipMessage(
            'Your organization membership request ' +
            'was rejected. Contact your organization administrator.'
          );

          setAuthForm(prev => ({
            ...prev,
            password: ''
          }));

          setMode('rejected');

          return;

        }

        throw e;

      }

    });

  };

  // ORGANIZATION SEARCH

  const searchOrganizations = async () => {

    setOrganizations([]);
    setOrganizationId('');

    await action(async () => {

      const search = organizationSearch.trim();

      if (search.length < 2) {

        throw new Error(
          'Enter at least two characters.'
        );

      }

      const results = await api(
        `/auth/organizations?search=${encodeURIComponent(search)}`
      );

      setOrganizations(results);

      if (results.length === 0) {

        setNotice(
          'No matching organizations found.'
        );

      }

    });

  };

  // ADMIN MEMBERSHIP APPROVAL

  const reviewMembership = async (id, decision) => {

    await action(async () => {

      await request(
        `/auth/organization/requests/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ decision })
        }
      );

      await refresh();

      setNotice(
        decision === 'approved'
          ? 'Employee membership approved.'
          : 'Employee membership rejected.'
      );

    });

  };

  // LOGOUT

  const logout = () => {

    sessionStorage.removeItem('SentriX_token');

    setToken('');
    setUser(null);

    setRisks([]);
    setUsers([]);
    setSecurityEvents([]);
    setMembershipRequests([]);
    setMembershipMessage('');

    setSelectedRiskId(null);
    setActiveSection('overview');
    setSidebarOpen(false);

    setForm(blank);
    setEditing(null);
    setReport(blankReport);
    setShowReport(false);

    setLogs([]);
    setLogTitle('');

    setAiResult(null);
    setSelectedRecommendations([]);

    setRiskSearch('');
    setSeverityFilter('all');
    setStatusFilter('all');

    setAuthForm({
      name: '',
      email: '',
      password: ''
    });

    setAccountMode('personal');
    setOrganizationAction('create');
    setOrganizationName('');
    setOrganizationSearch('');
    setOrganizations([]);
    setOrganizationId('');

    setError('');
    setNotice('');
    setMode('login');

  };

  // FORGOT PASSWORD

  const forgotPassword = async (e) => {

    e.preventDefault();

    await action(async () => {

      const data = await api(
        '/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({
            email: authForm.email
          })
        }
      );

      setNotice(
        data.message ||
        'If registered, a reset link will be sent.'
      );

    });

  };

  // RESET PASSWORD

  const resetPassword = async (e) => {

    e.preventDefault();

    if (newPassword !== confirmPassword) {

      setError('Passwords do not match.');
      return;

    }

    await action(async () => {

      const data = await api(
        '/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            token: resetToken,
            password: newPassword
          })
        }
      );

      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');

      sessionStorage.removeItem('SentriX_token');

      setToken('');
      setUser(null);

      window.history.replaceState(
        {},
        '',
        window.location.pathname
      );

      setMode('login');

      setNotice(
        data.message ||
        'Password reset successful. Please log in.'
      );

    });

  };

  // RISK SEARCH AND FILTERS

  const filteredRisks = risks.filter(risk => {

    const matchesSearch = risk.title
      .toLowerCase()
      .includes(riskSearch.trim().toLowerCase());

    const matchesSeverity =
      severityFilter === 'all' ||
      risk.severity === severityFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      risk.status === statusFilter;

    return (
      matchesSearch &&
      matchesSeverity &&
      matchesStatus
    );

  });

  // INDIVIDUAL RISK DETAILS

  const openRiskDetails = (riskId) => {

    setSelectedRiskId(riskId);
    setActiveSection('risk-details');

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });

  };

  const selectedRisk = risks.find(
    risk => risk._id === selectedRiskId
  );

  // CREATE OR EDIT RISK

  const save = async (e) => {

    e.preventDefault();

    await action(async () => {

      const payload = {

        ...form,

        assignedTo: isPersonal
          ? null
          : form.assignedTo || null,

        deadline: form.deadline || null

      };

      await request(
        editing ? `/risks/${editing}` : '/risks',
        {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        }
      );

      setForm(blank);
      setEditing(null);
      setAiResult(null);
      setSelectedRecommendations([]);

      await refresh();

      setNotice('Risk saved successfully.');

    });

  };

  // EMPLOYEE RISK REPORTING

  const submitReport = async (e) => {

    e.preventDefault();

    await action(async () => {

      await request('/risks/report', {

        method: 'POST',

        body: JSON.stringify(report)

      });

      setReport(blankReport);
      setShowReport(false);

      await refresh();

      setNotice(
        'Risk report submitted. An admin can now review it.'
      );

    });

  };

  // ADMIN RISK REPORT APPROVAL

  const reviewReport = async (id, decision) => {

    await action(async () => {

      await request(`/risks/${id}/review`, {

        method: 'PATCH',

        body: JSON.stringify({ decision })

      });

      await refresh();

      setNotice(`Report ${decision}.`);

    });

  };

  // EMPLOYEE CLAIM RISK

  const claimRisk = async (id) => {

    await action(async () => {

      await request(`/risks/${id}/claim`, {

        method: 'PATCH'

      });

      await refresh();

      setNotice(
        'You are now assigned to this risk.'
      );

    });

  };

  // UPDATE RISK STATUS

  const changeStatus = async (id, status) => {

    await action(async () => {

      await request(`/risks/${id}/status`, {

        method: 'PATCH',

        body: JSON.stringify({ status })

      });

      await refresh();

      setNotice(
        status === 'closed'
          ? 'Risk closed successfully.'
          : 'Risk status updated.'
      );

    });

  };

  // ADMIN VERIFICATION

  const verify = async (id) => {

    await action(async () => {

      await request(`/risks/${id}/verify`, {

        method: 'PATCH'

      });

      await refresh();

      setNotice('Risk verified and closed.');

    });

  };

  // EDIT RISK

  const startEdit = (r) => {

    setEditing(r._id);

    setAiResult(null);
    setSelectedRecommendations([]);

    setForm({

      title: r.title,

      description: r.description,

      category: r.category,

      severity: r.severity,

      deadline: r.deadline
        ? r.deadline.slice(0, 10)
        : '',

      assignedTo: r.assignedTo?._id || '',

      likelihood: r.likelihood || 3,

      impact: r.impact || 3,

      controls: (r.controls || []).map(c => ({
        name: c.name,
        implemented: c.implemented
      }))

    });

    navigateTo('manage');

  };

  // AI RISK ASSESSMENT

  const analyzeRisk = async () => {

    setError('');
    setNotice('');
    setAiResult(null);
    setAiLoading(true);

    try {

      const result = await request(
        '/ai/analyze-risk',
        {
          method: 'POST',

          body: JSON.stringify({
            title: form.title,
            description: form.description,
            category: form.category
          })
        }
      );

      setAiResult(result);

      setSelectedRecommendations(
        result.recommendations.map((_, i) => i)
      );

    } catch (e) {

      setError(e.message);

    } finally {

      setAiLoading(false);

    }

  };

  // APPLY AI RECOMMENDATIONS

  const applyAi = () => {

    if (!aiResult) return;

    const chosen = aiResult.recommendations.filter(
      (_, i) => selectedRecommendations.includes(i)
    );

    setForm(f => {

      const existing = new Set(
        f.controls.map(
          c => c.name.trim().toLowerCase()
        )
      );

      const additions = [];

      for (const recommendation of chosen) {

        const name = recommendation.action
          .trim()
          .slice(0, 120);

        const key = name.toLowerCase();

        if (!existing.has(key) && name.length >= 2) {

          additions.push({
            name,
            implemented: false
          });

          existing.add(key);

        }

      }

      return {

        ...f,

        category: aiResult.category,

        severity: aiResult.severity,

        likelihood: aiResult.likelihood,

        impact: aiResult.impact,

        controls: [
          ...f.controls,
          ...additions
        ].slice(0, 15)

      };

    });

    setNotice(
      'Selected AI recommendations added. Review before saving.'
    );

    setAiResult(null);
    setSelectedRecommendations([]);

  };

  // SECURITY ALERT CONVERSION

  const convertSecurityEvent = async (event) => {

    const title =
      `Repeated failed logins (${event.count})`;

    const description =
      `Security monitoring reported ${event.count} ` +
      'failed login attempts within 15 minutes. ' +
      'Review authentication logs, validate the incident, ' +
      'and consider MFA or access controls.';

    await action(async () => {

      await request(
        `/security/events/${event._id}/convert`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            description
          })
        }
      );

      await refresh();

      setNotice(
        'Security alert converted into a risk.'
      );

    });

  };

  // AUDIT LOGS

  const showLogs = async (risk) => {

    await action(async () => {

      const data = await request(
        `/risks/${risk._id}/logs`
      );

      setLogs(data);
      setLogTitle(risk.title);

      navigateTo('audit-logs');

    });

  };

  // DASHBOARD DATA

  const pendingReports = risks.filter(
    r => r.reviewStatus === 'pending'
  );

  const dashboardRisks = risks;

  const overdue = dashboardRisks.filter(
    r =>
      r.deadline &&
      new Date(r.deadline) < new Date() &&
      r.status !== 'closed'
  ).length;

  const highPriority = dashboardRisks.filter(
    r =>
      (r.likelihood || 3) *
      (r.impact || 3) >= 15 &&
      r.status !== 'closed'
  ).length;

  const summary = [

    ['Total risks', dashboardRisks.length],

    [
      'Open',
      dashboardRisks.filter(
        r => r.status === 'open'
      ).length
    ],

    [
      'Critical',
      dashboardRisks.filter(
        r =>
          r.severity === 'critical' &&
          r.status !== 'closed'
      ).length
    ],

    [
      'Closed',
      dashboardRisks.filter(
        r => r.status === 'closed'
      ).length
    ]

  ];

  const bySeverity = severities.map(name => ({

    name,

    value: dashboardRisks.filter(
      r => r.severity === name
    ).length

  })).filter(x => x.value);

  const byStatus = statuses
    .filter(s => !isPersonal || s !== 'pending_review')
    .map(name => ({

      name: formatStatus(name),

      count: dashboardRisks.filter(
        r => r.status === name
      ).length

    }));

  // AUTHENTICATION SCREEN

  if ((!token || !user) || mode === 'reset') {

    return (

      <main className="min-h-screen flex items-center justify-center p-4">

        <div className="panel w-full max-w-md space-y-5">

          <div className="flex items-center gap-3">

            <ShieldCheck
              className="text-cyan-400"
              size={32}
            />

            <h1 className="text-3xl font-bold">
              SentriX
            </h1>

          </div>

          <p className="text-slate-400">
            Risk &amp; Compliance Management
          </p>

          <h2 className="text-xl font-semibold">

            {{

              login: 'Welcome back',

              register: 'Create your account',

              forgot: 'Forgot password?',

              reset: 'Set a new password',

              pending: 'Approval pending',

              rejected: 'Membership rejected'

            }[mode]}

          </h2>

          {/* PENDING OR REJECTED MEMBERSHIP */}

          {mode === 'pending' || mode === 'rejected' ? (

            <div className="space-y-4">

              <div className={`rounded-xl border p-4 ${
                mode === 'pending'
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-red-500/30 bg-red-500/10'
              }`}>

                <div className="mb-3 flex items-center gap-2">

                  {mode === 'pending'
                    ? <FileClock className="text-amber-400"/>
                    : <ShieldAlert className="text-red-400"/>
                  }

                  <span className="font-semibold">

                    {mode === 'pending'
                      ? 'Awaiting administrator approval'
                      : 'Access not approved'}

                  </span>

                </div>

                <p className="text-sm text-slate-300">
                  {membershipMessage}
                </p>

              </div>

              <button
                type="button"
                className="btn w-full"
                onClick={() => switchMode('login')}
              >
                Back to login
              </button>

            </div>

          ) : mode === 'forgot' ? (

            /* FORGOT PASSWORD */

            <form
              onSubmit={forgotPassword}
              className="space-y-3"
            >

              <p className="text-sm text-slate-400">

                Enter your registered email address.
                If it belongs to an account, we will
                send a password-reset link.

              </p>

              <input
                aria-label="Email"
                type="email"
                autoComplete="email"
                required
                placeholder="Email"
                value={authForm.email}
                onChange={e => setAuthForm({
                  ...authForm,
                  email: e.target.value
                })}
              />

              <button
                className="btn w-full"
                disabled={loading}
              >

                {loading
                  ? 'Sending...'
                  : 'Send reset link'}

              </button>

            </form>

          ) : mode === 'reset' ? (

            /* RESET PASSWORD */

            <form
              onSubmit={resetPassword}
              className="space-y-3"
            >

              <input
                aria-label="New password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                placeholder="New password (8+ characters)"
                value={newPassword}
                onChange={e =>
                  setNewPassword(e.target.value)
                }
              />

              <input
                aria-label="Confirm new password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={e =>
                  setConfirmPassword(e.target.value)
                }
              />

              <button
                className="btn w-full"
                disabled={loading || !resetToken}
              >

                {loading
                  ? 'Resetting...'
                  : 'Reset password'}

              </button>

            </form>

          ) : (

            /* LOGIN AND REGISTER FORM */

            <form
              onSubmit={login}
              className="space-y-3"
            >

              {mode === 'register' && (

                <>

                  <input
                    aria-label="Name"
                    placeholder="Full name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={80}
                    value={authForm.name}
                    onChange={e => setAuthForm({
                      ...authForm,
                      name: e.target.value
                    })}
                  />

                  {/* ACCOUNT MODE SELECTION */}

                  <div className="space-y-2">

                    <label>Account type</label>

                    <div className="grid grid-cols-2 gap-3">

                      <button
                        type="button"
                        className={`rounded-xl border p-3 text-left ${
                          accountMode === 'personal'
                            ? 'border-cyan-400 bg-cyan-400/10'
                            : 'border-slate-700 bg-slate-900'
                        }`}
                        onClick={() =>
                          setAccountMode('personal')
                        }
                      >

                        <UserRound
                          className="mb-2 text-cyan-400"
                          size={22}
                        />

                        <p className="font-semibold">
                          Personal
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Manage your own risks
                        </p>

                      </button>

                      <button
                        type="button"
                        className={`rounded-xl border p-3 text-left ${
                          accountMode === 'organization'
                            ? 'border-cyan-400 bg-cyan-400/10'
                            : 'border-slate-700 bg-slate-900'
                        }`}
                        onClick={() =>
                          setAccountMode('organization')
                        }
                      >

                        <Users
                          className="mb-2 text-cyan-400"
                          size={22}
                        />

                        <p className="font-semibold">
                          Organization
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Collaborate with your team
                        </p>

                      </button>

                    </div>

                  </div>

                  {/* ORGANIZATION REGISTRATION */}

                  {accountMode === 'organization' && (

                    <div className="space-y-3 rounded-xl border border-slate-700 p-3">

                      <label>
                        Organization setup
                      </label>

                      <select
                        value={organizationAction}
                        onChange={e => {

                          setOrganizationAction(
                            e.target.value
                          );

                          setOrganizationId('');
                          setOrganizations([]);

                        }}
                      >

                        <option value="create">
                          Create an organization
                        </option>

                        <option value="join">
                          Join an existing organization
                        </option>

                      </select>

                      {organizationAction === 'create' ? (

                        <>

                          <input
                            placeholder="Organization name"
                            required
                            minLength={2}
                            maxLength={120}
                            value={organizationName}
                            onChange={e =>
                              setOrganizationName(
                                e.target.value
                              )
                            }
                          />

                          <p className="text-xs text-slate-400">

                            You will become the administrator
                            of this organization.

                          </p>

                        </>

                      ) : (

                        <>

                          <div className="flex gap-2">

                            <input
                              placeholder="Search organization"
                              value={organizationSearch}
                              onChange={e => {

                                setOrganizationSearch(
                                  e.target.value
                                );

                                setOrganizationId('');
                                setOrganizations([]);

                              }}
                            />

                            <button
                              type="button"
                              className="secondary"
                              disabled={
                                loading ||
                                organizationSearch.trim().length < 2
                              }
                              onClick={searchOrganizations}
                            >
                              Search
                            </button>

                          </div>

                          {organizations.length > 0 && (

                            <select
                              required
                              value={organizationId}
                              onChange={e =>
                                setOrganizationId(
                                  e.target.value
                                )
                              }
                            >

                              <option value="">
                                Select an organization
                              </option>

                              {organizations.map(org => (

                                <option
                                  key={org._id}
                                  value={org._id}
                                >
                                  {org.name}
                                </option>

                              ))}

                            </select>

                          )}

                          <p className="text-xs text-amber-300">

                            An administrator must approve
                            your request before you can access
                            the organization.

                          </p>

                        </>

                      )}

                    </div>

                  )}

                </>

              )}

              <input
                aria-label="Email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="Email"
                value={authForm.email}
                onChange={e => setAuthForm({
                  ...authForm,
                  email: e.target.value
                })}
              />

              <input
                aria-label="Password"
                type="password"
                autoComplete={
                  mode === 'login'
                    ? 'current-password'
                    : 'new-password'
                }
                required
                minLength={8}
                maxLength={128}
                placeholder="Password (8+ characters)"
                value={authForm.password}
                onChange={e => setAuthForm({
                  ...authForm,
                  password: e.target.value
                })}
              />

              <button
                className="btn w-full"
                disabled={
                  loading ||
                  !!token ||
                  (
                    mode === 'register' &&
                    accountMode === 'organization' &&
                    organizationAction === 'join' &&
                    !organizationId
                  )
                }
              >

                {loading || token
                  ? 'Please wait...'
                  : mode === 'login'
                    ? 'Log in'
                    : accountMode === 'organization' &&
                      organizationAction === 'join'
                      ? 'Request to join'
                      : 'Register'}

              </button>

            </form>

          )}

          {/* AUTHENTICATION LINKS */}

          <div className="flex flex-col items-start gap-2">

            {mode === 'login' && (

              <>

                <button
                  type="button"
                  className="text-cyan-400 text-sm"
                  onClick={() => switchMode('forgot')}
                >
                  Forgot password?
                </button>

                <button
                  type="button"
                  className="text-cyan-400 text-sm"
                  onClick={() => switchMode('register')}
                >
                  Need an account? Register
                </button>

              </>

            )}

            {mode === 'register' && (

              <button
                type="button"
                className="text-cyan-400 text-sm"
                onClick={() => switchMode('login')}
              >
                Already registered? Log in
              </button>

            )}

            {(mode === 'forgot' || mode === 'reset') && (

              <button
                type="button"
                className="text-cyan-400 text-sm"
                onClick={() => {

                  if (mode === 'reset') {

                    window.history.replaceState(
                      {},
                      '',
                      window.location.pathname
                    );

                    setResetToken('');

                  }

                  switchMode('login');

                }}
              >
                Back to login
              </button>

            )}

          </div>

          {error && (

            <p role="alert" className="text-red-400">
              {error}
            </p>

          )}

          {notice && (

            <p role="status" className="text-emerald-400">
              {notice}
            </p>

          )}

        </div>

      </main>

    );

  }

  // SIDEBAR NAVIGATION

  const navItems = [

    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard
    },

    {
      id: 'risk-register',
      label: 'Risk Register',
      icon: ClipboardList
    },

    ...(isEmployee
      ? [

        {
          id: 'report-risk',
          label: 'Report Risk',
          icon: Plus
        }

      ]
      : [

        {
          id: 'manage',
          label: 'Risk Management',
          icon: ShieldCheck
        },

        {
          id: 'security-alerts',
          label: 'Security Alerts',
          icon: ShieldAlert
        }

      ]),

    ...(isAdmin
      ? [

        {
          id: 'membership-requests',
          label: 'Membership Requests',
          icon: Users
        }

      ]
      : []),

    {
      id: 'audit-logs',
      label: 'Audit Logs',
      icon: FileClock
    }

  ];

  // AVAILABLE RISK STATUS OPTIONS

  const availableStatuses = (risk) => {

    return statuses.filter(status => {

      if (isPersonal) {

        return status !== 'pending_review';

      }

      if (status === 'closed') return false;

      if (
        isEmployee &&
        status === 'open' &&
        risk.status !== 'open'
      ) {

        return false;

      }

      return true;

    });

  };

  // RISK ACTION BUTTONS

  const renderRiskActions = (r) => (

    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">

      {approvedRisk(r) &&
        r.status !== 'closed' &&
        (
          canManageRisks ||
          r.assignedTo?._id === (user._id || user.id)
        ) && (

          <select
            aria-label={`Update status for ${r.title}`}
            className="w-full min-w-0 text-sm sm:w-auto sm:max-w-48"
            value={r.status}
            disabled={loading}
            onChange={e =>
              changeStatus(r._id, e.target.value)
            }
          >

            {availableStatuses(r).map(s => (

              <option
                value={s}
                key={s}
                disabled={
                  isEmployee && s === 'open'
                }
              >
                {formatStatus(s)}
              </option>

            ))}

          </select>

        )}

      {canManageRisks &&
        approvedRisk(r) &&
        !['closed', 'pending_review'].includes(
          r.status
        ) && (

          <button
            type="button"
            className="secondary text-sm"
            disabled={loading}
            onClick={() => startEdit(r)}
          >
            Edit
          </button>

        )}

      {isAdmin &&
        approvedRisk(r) &&
        r.status === 'pending_review' && (

          <button
            type="button"
            className="btn text-sm"
            disabled={loading}
            onClick={() => verify(r._id)}
          >
            Verify &amp; close
          </button>

        )}

      {isEmployee &&
        r.reviewStatus === 'accepted' &&
        !r.assignedTo &&
        r.createdBy?._id === (user._id || user.id) &&
        r.status === 'open' && (

          <button
            type="button"
            className="btn text-sm"
            disabled={loading}
            onClick={() => claimRisk(r._id)}
          >
            Claim risk
          </button>

        )}

      {!selectedRiskId && (

        <button
          type="button"
          className="secondary text-sm"
          onClick={() => openRiskDetails(r._id)}
        >
          View details
        </button>

      )}

      <button
        type="button"
        className="secondary text-sm"
        disabled={loading}
        onClick={() => showLogs(r)}
      >
        Audit log
      </button>

    </div>

  );

  // MAIN DASHBOARD

  return (

    <div className="min-h-screen lg:flex">

      {sidebarOpen && (

        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/80 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />

      )}

      {/* SIDEBAR */}

      <aside className={`${

        sidebarOpen
          ? 'translate-x-0'
          : '-translate-x-full'

      } fixed inset-y-0 left-0 z-40 flex w-64 flex-col
        border-r border-slate-800/80 bg-[#081321]
        shadow-2xl transition-transform duration-200
        lg:sticky lg:top-0 lg:h-screen
        lg:translate-x-0 lg:shadow-none`}>

        <div className="flex h-20 items-center justify-between border-b border-slate-800/70 px-6">

          <div className="flex items-center gap-3">

            <span className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-2">

              <ShieldCheck
                className="text-cyan-400"
                size={25}
              />

            </span>

            <div>

              <h1 className="text-xl font-extrabold tracking-tight">

                Sentri<span className="text-cyan-400">X</span>

              </h1>

              <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-slate-500">
                Security Platform
              </p>

            </div>

          </div>

          <button
            type="button"
            className="text-slate-400 lg:hidden"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={21}/>
          </button>

        </div>

        <div className="px-5 pt-7 pb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">

          {isPersonal
            ? 'Personal Workspace'
            : 'Organization Workspace'}

        </div>

        <nav
          aria-label="Main navigation"
          className="flex-1 overflow-y-auto space-y-1 px-3"
        >

          {navItems.map(item => {

            const Icon = item.icon;

            return (

              <button
                type="button"
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${

                  activeSection === item.id

                    ? 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-300'

                    : 'border border-transparent text-slate-400 hover:bg-slate-800/70 hover:text-white'

                }`}
              >

                <Icon size={18}/>

                <span className="flex-1">
                  {item.label}
                </span>

                {item.id === 'membership-requests' &&
                  membershipRequests.length > 0 && (

                    <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-300">

                      {membershipRequests.length}

                    </span>

                  )}

                {activeSection === item.id && (

                  <ChevronRight size={14}/>

                )}

              </button>

            );

          })}

        </nav>

        <div className="mx-4 mb-4 rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-3">

          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">

            <Activity size={14}/>

            Command Center

          </div>

          <p className="mt-1 text-xs text-slate-500">

            {isPersonal
              ? 'Personal risk workspace'
              : 'Risk & compliance workspace'}

          </p>

        </div>

        <div className="border-t border-slate-800/70 p-4">

          <div className="flex items-center gap-3 rounded-xl bg-slate-900/70 p-3">

            <span className="rounded-lg bg-slate-800 p-2 text-cyan-300">

              <UserRound size={18}/>

            </span>

            <div className="min-w-0 flex-1">

              <p className="truncate text-sm font-semibold">
                {user.name}
              </p>

              <p className="text-xs capitalize text-slate-400">

                {isPersonal
                  ? 'Personal account'
                  : user.role}

              </p>

            </div>

            <button
              type="button"
              title="Log out"
              aria-label="Log out"
              onClick={logout}
              className="text-slate-400 hover:text-red-300"
            >

              <LogOut size={18}/>

            </button>

          </div>

        </div>

      </aside>

      {/* MAIN CONTENT */}

      <div className="min-w-0 flex-1">

        <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#081321]/95 backdrop-blur-xl">

          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">

            <div className="flex items-center gap-3">

              <button
                type="button"
                className="secondary lg:hidden"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
              >

                <Menu size={19}/>

              </button>

              <div>

                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400">

                  SentriX / {isPersonal
                    ? 'Personal'
                    : 'Organization'}

                </p>

                <h2 className="text-lg font-bold sm:text-xl">
                  Security Command Center
                </h2>

              </div>

            </div>

            <button
              type="button"
              onClick={() => action(() => refresh())}
              disabled={loading}
              className="secondary flex items-center gap-2"
            >

              <RefreshCw size={16}/>

              <span className="hidden sm:inline">
                Refresh data
              </span>

            </button>

          </div>

        </header>

        <main className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 sm:py-9">

          {/* GLOBAL MESSAGES */}

          {error && (

            <p
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-950/70 p-3 text-red-300"
            >
              {error}
            </p>

          )}

          {notice && (

            <p
              role="status"
              className="rounded-xl border border-emerald-500/20 bg-emerald-950/70 p-3 text-emerald-300"
            >
              {notice}
            </p>

          )}

          {/* INDIVIDUAL RISK DETAILS */}

          {selectedRiskId ? (

            <section className="panel space-y-6">

              <button
                type="button"
                className="secondary"
                onClick={() => navigateTo('risk-register')}
              >
                ← Back to Risk Register
              </button>

              {selectedRisk ? (

                <div className="space-y-6">

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400">

                      {selectedRisk.category}

                    </p>

                    <h2 className="mt-2 break-words text-2xl font-bold sm:text-3xl">

                      {selectedRisk.title}

                    </h2>

                    <p className="mt-3 whitespace-pre-wrap break-words text-slate-400">

                      {selectedRisk.description}

                    </p>

                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

                    {[

                      [
                        'Severity',
                        selectedRisk.severity
                      ],

                      [
                        'Status',
                        formatStatus(selectedRisk.status)
                      ],

                      [
                        'Likelihood',
                        selectedRisk.likelihood ?? 3
                      ],

                      [
                        'Impact',
                        selectedRisk.impact ?? 3
                      ],

                      [
                        'Risk score',
                        `${(selectedRisk.likelihood ?? 3) *
                          (selectedRisk.impact ?? 3)}/25`
                      ],

                      [
                        'Review',
                        isPersonal
                          ? 'Self-managed'
                          : selectedRisk.reviewStatus || 'Approved'
                      ],

                      [
                        'Deadline',
                        selectedRisk.deadline
                          ? new Date(
                            selectedRisk.deadline
                          ).toLocaleDateString()
                          : 'Not set'
                      ],

                      [
                        'Owner',
                        isPersonal
                          ? user.name
                          : selectedRisk.assignedTo?.name ||
                            'Unassigned'
                      ]

                    ].map(([label, value]) => (

                      <div
                        key={label}
                        className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                      >

                        <p className="text-xs text-slate-400">
                          {label}
                        </p>

                        <p className="mt-2 break-words text-lg font-bold capitalize text-white">
                          {value}
                        </p>

                      </div>

                    ))}

                  </div>

                  <MitigationProgress
                    controls={selectedRisk.controls || []}
                  />

                  <div className="rounded-xl border border-slate-800 p-4">

                    <h3 className="mb-3 text-lg font-bold">
                      Mitigation Plan
                    </h3>

                    {(selectedRisk.controls || []).length === 0 ? (

                      <p className="text-slate-400">
                        No mitigation controls added yet.
                      </p>

                    ) : (

                      <div className="space-y-2">

                        {selectedRisk.controls.map(
                          (control, index) => (

                            <div
                              key={index}
                              className="flex items-start gap-3 rounded-lg bg-slate-900 p-3"
                            >

                              <span className={
                                control.implemented
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }>

                                {control.implemented
                                  ? '✓'
                                  : '○'}

                              </span>

                              <span className="break-words">
                                {control.name}
                              </span>

                            </div>

                          )
                        )}

                      </div>

                    )}

                  </div>

                  {renderRiskActions(selectedRisk)}

                </div>

              ) : (

                <p className="text-slate-400">

                  This risk is unavailable or no longer accessible.

                </p>

              )}

            </section>

          ) : (

            <>

              {/* OVERVIEW */}

              <section
                id="overview"
                className="scroll-mt-28 space-y-5"
              >

                <div className="flex flex-wrap items-center justify-between gap-3">

                  <div>

                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
                      Operational intelligence
                    </p>

                    <h2 className="text-3xl font-extrabold">
                      Risk Overview
                    </h2>

                    <p className="mt-2 text-sm text-slate-400">

                      {isAdmin

                        ? 'Monitor organizational risks, security events, and approvals.'

                        : isPersonal

                          ? 'Identify, assess and manage your personal security risks.'

                          : 'Report security issues and track risks assigned to you.'}

                    </p>

                  </div>

                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">

                    Workspace active

                  </span>

                </div>

              </section>

              {/* METRIC CARDS */}

              <section className="grid grid-cols-2 md:grid-cols-4 gap-3">

                {summary.map(([name, value]) => (

                  <div className="panel" key={name}>

                    <p className="text-sm text-slate-400">
                      {name}
                    </p>

                    <p className="text-4xl font-bold mt-2">
                      {value}
                    </p>

                  </div>

                ))}

              </section>

              <section className="grid grid-cols-2 gap-3">

                <div className="panel">

                  <p className="text-slate-400 text-sm">
                    High priority (score ≥15)
                  </p>

                  <p className="text-3xl font-bold text-orange-400">
                    {highPriority}
                  </p>

                </div>

                <div className="panel">

                  <p className="text-slate-400 text-sm">
                    Overdue risks
                  </p>

                  <p className="text-3xl font-bold text-red-400">
                    {overdue}
                  </p>

                </div>

              </section>

              {/* DASHBOARD CHARTS */}

              <section className="grid md:grid-cols-2 gap-4">

                <div className="panel">

                  <h3 className="font-semibold mb-4">
                    Severity distribution
                  </h3>

                  <div className="h-56">

                    {bySeverity.length ? (

                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                      >

                        <PieChart>

                          <Pie
                            data={bySeverity}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={85}
                            label
                          >

                            {bySeverity.map(x => (

                              <Cell
                                key={x.name}
                                fill={
                                  colors[
                                    severities.indexOf(x.name)
                                  ]
                                }
                              />

                            ))}

                          </Pie>

                          <Tooltip/>

                        </PieChart>

                      </ResponsiveContainer>

                    ) : (

                      <p className="text-slate-500">
                        No risks yet
                      </p>

                    )}

                  </div>

                </div>

                <div className="panel">

                  <h3 className="font-semibold mb-4">
                    Risks by status
                  </h3>

                  <div className="h-56">

                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >

                      <BarChart data={byStatus}>

                        <XAxis
                          dataKey="name"
                          tick={{
                            fill: '#94a3b8',
                            fontSize: 11
                          }}
                        />

                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: '#94a3b8' }}
                        />

                        <Tooltip/>

                        <Bar
                          dataKey="count"
                          fill="#06b6d4"
                          radius={[4, 4, 0, 0]}
                        />

                      </BarChart>

                    </ResponsiveContainer>

                  </div>

                </div>

              </section>

              {/* ADMIN MEMBERSHIP REQUESTS */}

              {isAdmin && (

                <section
                  id="membership-requests"
                  className="panel scroll-mt-28 space-y-4"
                >

                  <div className="flex flex-wrap items-center justify-between gap-3">

                    <div>

                      <h3 className="flex items-center gap-2 text-xl font-bold">

                        <Users
                          size={22}
                          className="text-cyan-400"
                        />

                        Membership Requests

                      </h3>

                      <p className="mt-1 text-sm text-slate-400">

                        Approve or reject employees requesting
                        access to your organization.

                      </p>

                    </div>

                    <button
                      type="button"
                      className="secondary"
                      disabled={loading}
                      onClick={() => action(() => refresh())}
                    >
                      Refresh requests
                    </button>

                  </div>

                  <div className="grid grid-cols-2 gap-3">

                    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">

                      <p className="text-sm text-slate-400">
                        Pending requests
                      </p>

                      <p className="mt-2 text-3xl font-bold text-amber-400">

                        {membershipRequests.length}

                      </p>

                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">

                      <p className="text-sm text-slate-400">
                        Approved employees
                      </p>

                      <p className="mt-2 text-3xl font-bold text-emerald-400">

                        {users.filter(
                          u => u.role === 'employee'
                        ).length}

                      </p>

                    </div>

                  </div>

                  {membershipRequests.length === 0 ? (

                    <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">

                      No pending membership requests.

                    </p>

                  ) : (

                    <div className="space-y-3">

                      {membershipRequests.map(member => (

                        <div
                          key={member._id}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4"
                        >

                          <div className="min-w-0">

                            <p className="font-semibold break-words">
                              {member.name}
                            </p>

                            <p className="text-sm text-slate-400 break-all">
                              {member.email}
                            </p>

                            <p className="mt-1 text-xs text-amber-300">
                              Pending approval
                            </p>

                            {member.createdAt && (

                              <p className="mt-1 text-xs text-slate-500">

                                Requested: {new Date(
                                  member.createdAt
                                ).toLocaleString()}

                              </p>

                            )}

                          </div>

                          <div className="flex flex-wrap gap-2">

                            <button
                              type="button"
                              className="btn text-sm"
                              disabled={loading}
                              onClick={() =>
                                reviewMembership(
                                  member._id,
                                  'approved'
                                )
                              }
                            >
                              Approve
                            </button>

                            <button
                              type="button"
                              className="secondary text-sm text-red-300"
                              disabled={loading}
                              onClick={() => {

                                if (window.confirm(
                                  'Reject this membership request?'
                                )) {

                                  reviewMembership(
                                    member._id,
                                    'rejected'
                                  );

                                }

                              }}
                            >
                              Reject
                            </button>

                          </div>

                        </div>

                      ))}

                    </div>

                  )}

                </section>

              )}

              {/* EMPLOYEE RISK REPORTING */}

              {isEmployee && (

                <section
                  id="report-risk"
                  className="panel scroll-mt-28 space-y-4"
                >

                  <div className="flex flex-wrap items-center justify-between gap-3">

                    <div>

                      <h3 className="text-xl font-bold">
                        Report a security risk
                      </h3>

                      <p className="text-sm text-slate-400">

                        Found a security issue? Submit it for review.
                        Do not include passwords or confidential data.

                      </p>

                    </div>

                    <button
                      type="button"
                      className="btn flex items-center gap-2"
                      onClick={() =>
                        setShowReport(v => !v)
                      }
                    >

                      <Plus size={16}/>

                      {showReport
                        ? 'Hide form'
                        : 'Report Risk'}

                    </button>

                  </div>

                  {showReport && (

                    <form
                      onSubmit={submitReport}
                      className="grid md:grid-cols-2 gap-4"
                    >

                      <div>

                        <label>Risk title</label>

                        <input
                          required
                          minLength={3}
                          maxLength={120}
                          value={report.title}
                          onChange={e => setReport({
                            ...report,
                            title: e.target.value
                          })}
                          placeholder="e.g. Shared files accessible to everyone"
                        />

                      </div>

                      <div>

                        <label>Category</label>

                        <select
                          value={report.category}
                          onChange={e => setReport({
                            ...report,
                            category: e.target.value
                          })}
                        >

                          {categories.map(c => (

                            <option key={c}>
                              {c}
                            </option>

                          ))}

                        </select>

                      </div>

                      <div className="md:col-span-2">

                        <label>Description</label>

                        <textarea
                          required
                          minLength={5}
                          maxLength={2000}
                          rows={4}
                          value={report.description}
                          onChange={e => setReport({
                            ...report,
                            description: e.target.value
                          })}
                          placeholder="Describe what you noticed and why it may be a risk."
                        />

                      </div>

                      <label className="md:col-span-2 flex items-center gap-2">

                        <input
                          className="w-auto"
                          type="checkbox"
                          checked={report.selfAssign}
                          onChange={e => setReport({
                            ...report,
                            selfAssign: e.target.checked
                          })}
                        />

                        Request to take responsibility
                        for this risk after review

                      </label>

                      <div className="md:col-span-2">

                        <button
                          className="btn"
                          disabled={loading}
                        >

                          {loading
                            ? 'Submitting...'
                            : 'Submit report'}

                        </button>

                      </div>

                    </form>

                  )}

                </section>

              )}

              {/* ADMIN RISK REPORT APPROVAL */}

              {isAdmin && pendingReports.length > 0 && (

                <section className="panel scroll-mt-28 space-y-3">

                  <h3 className="text-xl font-bold">

                    Employee reports awaiting review
                    ({pendingReports.length})

                  </h3>

                  <p className="text-sm text-slate-400">

                    Review reported issues before they enter
                    the approved risk register.

                  </p>

                  {pendingReports.map(r => (

                    <div
                      key={r._id}
                      className="rounded-lg border border-slate-700 p-4 space-y-2"
                    >

                      <p className="font-semibold">
                        {r.title}
                      </p>

                      <p className="text-sm text-slate-300">
                        {r.description}
                      </p>

                      <p className="text-xs text-slate-400">

                        {r.category} · Reported by{' '}
                        {r.createdBy?.name || 'Employee'}

                        {' · '}

                        {r.assignedTo?.name

                          ? 'Requested owner: ' +
                            r.assignedTo.name

                          : 'No owner requested'}

                      </p>

                      <div className="flex flex-wrap gap-2">

                        <button
                          className="btn text-sm"
                          disabled={loading}
                          onClick={() =>
                            reviewReport(r._id, 'accepted')
                          }
                        >
                          Accept report
                        </button>

                        <button
                          className="secondary text-sm"
                          disabled={loading}
                          onClick={() =>
                            reviewReport(r._id, 'rejected')
                          }
                        >
                          Reject report
                        </button>

                      </div>

                    </div>

                  ))}

                </section>

              )}

              {/* PERSONAL AND ADMIN RISK MANAGEMENT */}

              {canManageRisks && (

                <section
                  id="manage"
                  className="panel scroll-mt-28"
                >

                  <h3 className="font-bold text-xl mb-4 flex items-center gap-2">

                    <Plus size={20}/>

                    {editing
                      ? 'Edit risk'
                      : 'Create a new risk'}

                  </h3>

                  <form
                    onSubmit={save}
                    className="grid md:grid-cols-2 gap-4"
                  >

                    <div>

                      <label>Title</label>

                      <input
                        required
                        minLength={3}
                        maxLength={120}
                        value={form.title}
                        onChange={e => setForm({
                          ...form,
                          title: e.target.value
                        })}
                      />

                    </div>

                    <div>

                      <label>Category</label>

                      <select
                        value={form.category}
                        onChange={e => setForm({
                          ...form,
                          category: e.target.value
                        })}
                      >

                        {categories.map(c => (

                          <option key={c}>
                            {c}
                          </option>

                        ))}

                      </select>

                    </div>

                    <div>

                      <label>Severity</label>

                      <select
                        value={form.severity}
                        onChange={e => setForm({
                          ...form,
                          severity: e.target.value
                        })}
                      >

                        {severities.map(c => (

                          <option key={c}>
                            {c}
                          </option>

                        ))}

                      </select>

                    </div>

                    <div>

                      <label>Likelihood (1–5)</label>

                      <select
                        value={form.likelihood}
                        onChange={e => setForm({
                          ...form,
                          likelihood: Number(e.target.value)
                        })}
                      >

                        {[1, 2, 3, 4, 5].map(n => (

                          <option key={n} value={n}>
                            {n}
                          </option>

                        ))}

                      </select>

                    </div>

                    <div>

                      <label>Impact (1–5)</label>

                      <select
                        value={form.impact}
                        onChange={e => setForm({
                          ...form,
                          impact: Number(e.target.value)
                        })}
                      >

                        {[1, 2, 3, 4, 5].map(n => (

                          <option key={n} value={n}>
                            {n}
                          </option>

                        ))}

                      </select>

                    </div>

                    <div className="flex items-center text-cyan-300 font-semibold">

                      Risk score: {form.likelihood *
                        form.impact} / 25

                    </div>

                    {/* EMPLOYEE ASSIGNMENT - ADMIN ONLY */}

                    {isAdmin && (

                      <div>

                        <label>Assigned employee</label>

                        <select
                          value={form.assignedTo}
                          onChange={e => setForm({
                            ...form,
                            assignedTo: e.target.value
                          })}
                        >

                          <option value="">
                            Unassigned
                          </option>

                          {users.filter(
                            u => u.role === 'employee'
                          ).map(u => (

                            <option
                              key={u._id}
                              value={u._id}
                            >

                              {u.name} ({u.email})

                            </option>

                          ))}

                        </select>

                      </div>

                    )}

                    <div>

                      <label>Deadline</label>

                      <input
                        type="date"
                        value={form.deadline}
                        onChange={e => setForm({
                          ...form,
                          deadline: e.target.value
                        })}
                      />

                    </div>

                    <div className="md:col-span-2">

                      <label>Description</label>

                      <textarea
                        required
                        minLength={5}
                        maxLength={2000}
                        rows={3}
                        value={form.description}
                        onChange={e => setForm({
                          ...form,
                          description: e.target.value
                        })}
                      />

                    </div>

                    {/* AI RISK ASSESSMENT ASSISTANT */}

                    <div className="md:col-span-2 rounded-xl border border-cyan-700/60 bg-slate-950/70 p-4 space-y-3">

                      <div className="flex flex-wrap justify-between items-center gap-3">

                        <div>

                          <h4 className="font-semibold text-cyan-300">

                            AI Risk Assessment Assistant

                          </h4>

                          <p className="text-xs text-slate-400">

                            Uses the title and description above.
                            Do not submit passwords or confidential information.

                          </p>

                        </div>

                        <button
                          type="button"
                          className="secondary"
                          disabled={
                            aiLoading ||
                            loading ||
                            form.title.trim().length < 3 ||
                            form.description.trim().length < 10
                          }
                          onClick={analyzeRisk}
                        >

                          {aiLoading
                            ? 'Analyzing...'
                            : 'Analyze with AI'}

                        </button>

                      </div>

                      {aiResult && (

                        <div
                          className="space-y-2 text-sm"
                          aria-live="polite"
                        >

                          <p>

                            <strong>
                              Suggested category:
                            </strong>

                            {' '}{aiResult.category}

                            {' · '}

                            <strong>
                              Severity:
                            </strong>

                            {' '}{aiResult.severity}

                            {' · '}

                            <strong>
                              Score:
                            </strong>

                            {' '}

                            {aiResult.riskScore ??
                              aiResult.likelihood *
                              aiResult.impact}/25

                          </p>

                          <p>

                            <strong>Reasoning:</strong>

                            {' '}{aiResult.explanation}

                          </p>

                          <div className="space-y-2">

                            <strong>

                              AI-recommended mitigation plan
                              (select actions to add):

                            </strong>

                            {aiResult.recommendations.map(
                              (r, i) => (

                                <label
                                  key={i}
                                  className="block rounded-lg border border-slate-700 p-3 space-y-1 cursor-pointer"
                                >

                                  <span className="flex gap-2 items-center">

                                    <input
                                      type="checkbox"
                                      className="w-auto"
                                      checked={
                                        selectedRecommendations.includes(i)
                                      }
                                      onChange={e =>
                                        setSelectedRecommendations(
                                          prev => e.target.checked

                                            ? [...prev, i]

                                            : prev.filter(
                                              n => n !== i
                                            )
                                        )
                                      }
                                    />

                                    <strong>
                                      {r.action}
                                    </strong>

                                    <span className="ml-auto uppercase text-xs text-amber-300">

                                      {r.priority}

                                    </span>

                                  </span>

                                  <span className="block text-slate-300">

                                    Why: {r.reason}

                                  </span>

                                  <span className="block text-slate-400 text-xs">

                                    Suggested owner: {r.suggestedOwner}

                                    {r.timeframe &&
                                      ` · Timeframe: ${r.timeframe}`}

                                  </span>

                                </label>

                              )
                            )}

                          </div>

                          <p className="text-amber-300 text-xs">

                            {aiResult.advisory ||
                              'Review AI recommendations before applying them.'}

                          </p>

                          <button
                            type="button"
                            className="btn"
                            onClick={applyAi}
                          >

                            Apply assessment &amp; selected actions

                          </button>

                        </div>

                      )}

                    </div>

                    {/* MITIGATION CONTROLS */}

                    <div className="md:col-span-2 space-y-2">

                      <label>
                        Compliance / mitigation controls
                      </label>

                      {form.controls.map((c, i) => (

                        <div
                          key={i}
                          className="flex flex-wrap sm:flex-nowrap gap-2 items-center"
                        >

                          <input
                            aria-label={`Control ${i + 1}`}
                            required
                            minLength={2}
                            maxLength={120}
                            value={c.name}
                            onChange={e => setForm({
                              ...form,

                              controls: form.controls.map(
                                (x, j) => i === j

                                  ? {
                                    ...x,
                                    name: e.target.value
                                  }

                                  : x
                              )

                            })}
                          />

                          <label className="flex gap-1 items-center whitespace-nowrap">

                            <input
                              type="checkbox"
                              className="w-auto"
                              checked={c.implemented}
                              onChange={e => setForm({

                                ...form,

                                controls: form.controls.map(
                                  (x, j) => i === j

                                    ? {
                                      ...x,
                                      implemented: e.target.checked
                                    }

                                    : x
                                )

                              })}
                            />

                            Done

                          </label>

                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setForm({

                              ...form,

                              controls: form.controls.filter(
                                (_, j) => j !== i
                              )

                            })}
                          >
                            Remove
                          </button>

                        </div>

                      ))}

                      <button
                        type="button"
                        className="secondary"
                        disabled={form.controls.length >= 15}
                        onClick={() => setForm({

                          ...form,

                          controls: [

                            ...form.controls,

                            {
                              name: '',
                              implemented: false
                            }

                          ]

                        })}
                      >
                        + Add control
                      </button>

                    </div>

                    <div className="flex gap-2">

                      <button
                        className="btn"
                        disabled={loading || aiLoading}
                      >

                        {editing
                          ? 'Save changes'
                          : 'Create risk'}

                      </button>

                      {editing && (

                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {

                            setEditing(null);
                            setForm(blank);
                            setAiResult(null);
                            setSelectedRecommendations([]);

                          }}
                        >
                          Cancel
                        </button>

                      )}

                    </div>

                  </form>

                </section>

              )}

              {/* SECURITY ALERTS */}

              {canManageRisks && (

                <section
                  id="security-alerts"
                  className="panel scroll-mt-28"
                >

                  <div className="flex flex-wrap justify-between items-center gap-3 mb-4">

                    <div>

                      <h3 className="text-xl font-bold">
                        Security alerts
                      </h3>

                      <p className="text-slate-400 text-sm">

                        Simple failed-login monitoring.
                        Five failed attempts within 15 minutes
                        trigger an alert. This is a demo,
                        not a production intrusion detection system.

                      </p>

                    </div>

                    <button
                      className="secondary"
                      disabled={loading}
                      onClick={() => action(() => refresh())}
                    >
                      Refresh alerts
                    </button>

                  </div>

                  {securityEvents.length === 0 ? (

                    <p className="text-slate-400">
                      No security alerts yet.
                    </p>

                  ) : (

                    <div className="space-y-3">

                      {securityEvents.map(ev => (

                        <div
                          key={ev._id}
                          className="border border-slate-700 rounded-lg p-3 flex flex-wrap justify-between gap-3"
                        >

                          <div>

                            <p className="font-semibold">

                              Repeated failed logins · {ev.severity}

                            </p>

                            <p className="text-sm text-slate-300">
                              {ev.description}
                            </p>

                            <p className="text-xs text-slate-400">

                              {new Date(
                                ev.createdAt
                              ).toLocaleString()}

                              {' · '}{ev.status}

                            </p>

                          </div>

                          {ev.status === 'new' && (

                            <button
                              className="btn text-sm"
                              disabled={loading}
                              onClick={() =>
                                convertSecurityEvent(ev)
                              }
                            >
                              Convert to risk
                            </button>

                          )}

                        </div>

                      ))}

                    </div>

                  )}

                </section>

              )}

              {/* RESPONSIVE RISK REGISTER */}

              <section
                id="risk-register"
                className="panel scroll-mt-28"
              >

                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">

                  <h3 className="flex items-center gap-2 text-xl font-bold">

                    <ClipboardList size={20}/>

                    {isPersonal
                      ? 'My Risk Register'
                      : 'Risk register & reports'}

                  </h3>

                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">

                    {risks.length}

                    {' '}

                    {risks.length === 1
                      ? 'record'
                      : 'records'}

                  </span>

                </div>

                {/* SEARCH AND FILTERS */}

                <div className="mb-5 grid gap-3 md:grid-cols-3">

                  <input
                    type="text"
                    placeholder="Search risks by title..."
                    value={riskSearch}
                    onChange={e =>
                      setRiskSearch(e.target.value)
                    }
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  />

                  <select
                    value={severityFilter}
                    onChange={e =>
                      setSeverityFilter(e.target.value)
                    }
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  >

                    <option value="all">
                      All Severities
                    </option>

                    {severities.map(severity => (

                      <option
                        key={severity}
                        value={severity}
                      >
                        {severity}
                      </option>

                    ))}

                  </select>

                  <select
                    value={statusFilter}
                    onChange={e =>
                      setStatusFilter(e.target.value)
                    }
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  >

                    <option value="all">
                      All Statuses
                    </option>

                    {statuses.filter(
                      s => !isPersonal || s !== 'pending_review'
                    ).map(status => (

                      <option
                        key={status}
                        value={status}
                      >
                        {formatStatus(status)}
                      </option>

                    ))}

                  </select>

                </div>

                {filteredRisks.length === 0 ? (

                  <p className="rounded-xl border border-dashed border-slate-700 py-8 text-center text-slate-400">

                    No matching risks found.

                  </p>

                ) : (

                  <div className="grid gap-4 xl:grid-cols-2">

                    {filteredRisks.map(r => {

                      const completed = (r.controls || [])
                        .filter(c => c.implemented).length;

                      const total =
                        (r.controls || []).length;

                      const score =
                        (r.likelihood || 3) *
                        (r.impact || 3);

                      const reviewLabel = isPersonal

                        ? 'Self-managed'

                        : r.reviewStatus === 'pending'

                          ? 'Awaiting approval'

                          : r.reviewStatus === 'rejected'

                            ? 'Rejected'

                            : 'Approved';

                      return (

                        <article
                          key={r._id}
                          className="min-w-0 rounded-2xl border border-slate-700/70 bg-slate-950/40 p-4 sm:p-5"
                        >

                          {/* RISK HEADER */}

                          <div className="flex flex-wrap items-start justify-between gap-3">

                            <div className="min-w-0 flex-1">

                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-cyan-400">

                                {r.category}

                              </p>

                              <button
                                type="button"
                                onClick={() =>
                                  openRiskDetails(r._id)
                                }
                                className="break-words text-left text-base font-bold leading-snug text-white hover:text-cyan-400 hover:underline sm:text-lg"
                              >
                                {r.title}
                              </button>

                            </div>

                            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${

                              r.severity === 'critical'

                                ? 'border-red-500/30 bg-red-500/10 text-red-300'

                                : r.severity === 'high'

                                  ? 'border-orange-500/30 bg-orange-500/10 text-orange-300'

                                  : r.severity === 'medium'

                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'

                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'

                            }`}>

                              {r.severity}

                            </span>

                          </div>

                          {/* RISK DESCRIPTION */}

                          <p className="mt-3 break-words text-sm leading-relaxed text-slate-400">

                            {r.description}

                          </p>

                          {/* RISK INFORMATION */}

                          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:grid-cols-4">

                            <div>

                              <p className="text-xs text-slate-500">
                                Risk score
                              </p>

                              <p className="mt-1 font-semibold text-white">
                                {score}/25
                              </p>

                            </div>

                            <div>

                              <p className="text-xs text-slate-500">
                                Controls
                              </p>

                              <p className="mt-1 font-semibold text-white">
                                {completed}/{total}
                              </p>

                            </div>

                            <div>

                              <p className="text-xs text-slate-500">
                                Status
                              </p>

                              <p className="mt-1 font-semibold capitalize text-white">
                                {formatStatus(r.status)}
                              </p>

                              <p className="text-xs text-slate-400">
                                {reviewLabel}
                              </p>

                            </div>

                            <div>

                              <p className="text-xs text-slate-500">
                                Deadline
                              </p>

                              <p className="mt-1 font-semibold text-white">

                                {r.deadline

                                  ? new Date(
                                    r.deadline
                                  ).toLocaleDateString()

                                  : '—'}

                              </p>

                            </div>

                          </div>

                          {/* MITIGATION PROGRESS */}

                          <MitigationProgress
                            controls={r.controls || []}
                          />

                          {/* RISK OWNER */}

                          <p className="mt-3 break-words text-sm text-slate-400">

                            {isPersonal
                              ? 'Managed by: '
                              : 'Assigned to: '}

                            <span className="font-medium text-slate-200">

                              {isPersonal

                                ? user.name

                                : r.assignedTo?.name ||
                                  'Unassigned'}

                            </span>

                          </p>

                          {/* ACTION BUTTONS */}

                          {renderRiskActions(r)}

                        </article>

                      );

                    })}

                  </div>

                )}

              </section>

              {/* AUDIT LOGS */}

              <section
                id="audit-logs"
                className="panel scroll-mt-28"
              >

                <div className="flex items-center justify-between gap-3">

                  <div>

                    <h3 className="text-xl font-bold">
                      Audit Logs
                    </h3>

                    <p className="mt-1 text-sm text-slate-400">

                      Select Audit log on a risk to inspect
                      its recorded activity.

                    </p>

                  </div>

                  <FileClock
                    className="text-cyan-400"
                    size={22}
                  />

                </div>

                {!logTitle && (

                  <p className="mt-4 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">

                    No risk selected. Open the Risk Register
                    and choose Audit log.

                  </p>

                )}

                {logTitle && (

                  <div className="mt-5">

                    <div className="flex justify-between gap-2">

                      <h3 className="text-lg font-bold">

                        Audit log: {logTitle}

                      </h3>

                      <button
                        className="secondary"
                        onClick={() => {

                          setLogTitle('');
                          setLogs([]);

                        }}
                      >
                        Close
                      </button>

                    </div>

                    <div className="mt-4 space-y-3">

                      {logs.length === 0 && (

                        <p className="text-slate-400">
                          No audit records found.
                        </p>

                      )}

                      {logs.map(l => (

                        <div
                          key={l._id}
                          className="border-b border-slate-800 pb-3"
                        >

                          <div className="font-medium">

                            {formatStatus(l.action)}

                            {' · '}

                            {l.performedBy?.name || 'Unknown'}

                          </div>

                          <div className="text-xs text-slate-400">

                            {new Date(
                              l.createdAt
                            ).toLocaleString()}

                          </div>

                          <pre className="text-xs text-slate-400 whitespace-pre-wrap break-words mt-1">

                            {JSON.stringify(
                              l.newValue,
                              null,
                              2
                            )}

                          </pre>

                        </div>

                      ))}

                    </div>

                  </div>

                )}

              </section>

            </>

          )}

        </main>

      </div>

    </div>

  );

}