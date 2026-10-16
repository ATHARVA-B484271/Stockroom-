import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CategoryDetailPage,
  MovementHistoryPage,
  ReportsDashboard,
  StockEntryTabs,
  StockFlowPage,
  TeamManagementPage,
} from './AdvancedPages'
import './App.css'
import './redesign.css'
import './AdvancedPages.css'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const pageSize = 10

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || 'Something went wrong. Please try again.')
    error.status = response.status
    throw error
  }
  return payload
}

const icons = {
  overview: 'M3 3h7v7H3z M14 3h7v4h-7z M14 10h7v11h-7z M3 13h7v8H3z',
  products: 'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5',
  categories: 'M4 5h16v14H4z M8 9h8 M8 13h5',
  stock: 'M7 7h13l-3-3 M17 17H4l3 3 M20 7l-3 3 M4 17l3-3',
  history: 'M3 12a9 9 0 1 0 2.64-6.36L3 8 M3 3v5h5 M12 7v5l3 2',
  reports: 'M4 19V5 M4 19h17 M8 15l4-4 3 2 5-6',
  warning: 'M12 3 2 21h20L12 3z M12 9v4 M12 17h.01',
  team: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 8v6 M23 11h-6',
  search: 'm20 20-4.3-4.3 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  close: 'M18 6 6 18 M6 6l12 12',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M7 17 17 7 M7 7h10v10',
  logout: 'M10 17l5-5-5-5 M15 12H3 M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6',
  boxes: 'm12 3 9 5-9 5-9-5 9-5z M3 12l9 5 9-5 M3 16l9 5 9-5 M12 8v5',
}

const navigation = [
  { id: 'overview', label: 'Overview', icon: icons.overview },
  { id: 'products', label: 'Products', icon: icons.products, permission: 'inventory.read' },
  { id: 'categories', label: 'Categories', icon: icons.categories, permission: 'inventory.read' },
  { id: 'stock', label: 'Stock entry', icon: icons.stock, permission: 'movements.read' },
  { id: 'history', label: 'Movement history', icon: icons.history, permission: 'movements.read' },
  { id: 'reports', label: 'Inventory reports', icon: icons.reports, permission: 'reports.read' },
  { id: 'team', label: 'Team', icon: icons.team, permission: 'team.manage' },
]

const pagePermissions = {
  products: 'inventory.read',
  categories: 'inventory.read',
  'category-detail': 'inventory.read',
  stock: 'movements.read',
  'stock-in': 'movements.in',
  'stock-out': 'movements.out',
  history: 'movements.read',
  reports: 'reports.read',
  team: 'team.manage',
}

function canUser(user, permission) {
  return user?.role === 'admin' || user?.permissions?.includes(permission) || false
}

function Icon({ name, size = 18, ...props }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d={icons[name]} />
    </svg>
  )
}

function Brand({ compact = false }) {
  return (
    <span className={`brand-lockup${compact ? ' brand-compact' : ''}`}>
      <span className="brand-symbol"><Icon name="boxes" size={19} /></span>
      <span>StockRoom</span>
    </span>
  )
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('inventory-token'))
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'))
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('overview')
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [team, setTeam] = useState({ users: [], invitations: [] })
  const [movements, setMovements] = useState([])
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [invitePreview, setInvitePreview] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState('')
  const [movementType, setMovementType] = useState('in')
  const [initialMovementProduct, setInitialMovementProduct] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [editing, setEditing] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const searchRef = useRef(null)
  const userRef = useRef(user)
  userRef.current = user

  const loadData = useCallback(async (activeToken = token, activeUser = userRef.current) => {
    if (!activeToken) return
    setBusy(true)
    setError('')
    try {
      const [productData, categoryData, movementData, dashboardData, teamData] = await Promise.all([
      canUser(activeUser, 'inventory.read') ? request('/products', { token: activeToken }) : Promise.resolve({ products: [] }),
      canUser(activeUser, 'inventory.read') ? request('/categories', { token: activeToken }) : Promise.resolve({ categories: [] }),
      canUser(activeUser, 'movements.read') ? request('/movements?limit=50', { token: activeToken }) : Promise.resolve({ movements: [] }),
        canUser(activeUser, 'dashboard.read') ? request('/dashboard', { token: activeToken }) : Promise.resolve(null),
        canUser(activeUser, 'team.manage') ? request('/auth/team', { token: activeToken }) : Promise.resolve(null),
      ])
      setProducts(productData.products)
      setCategories(categoryData.categories)
      setMovements(movementData.movements)
      setSummary(dashboardData)
      setTeam(teamData || { users: [], invitations: [] })
    } catch (requestError) {
      setError(requestError.message)
      if (requestError.status === 401) signOut()
    } finally {
      setBusy(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    request('/auth/me', { token })
      .then(({ user: signedInUser }) => {
        setUser(signedInUser)
        return loadData(token, signedInUser)
      })
      .catch((requestError) => {
        setError(requestError.message)
        signOut()
      })
  }, [token, loadData])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    function handleSearchShortcut(event) {
      if (canUser(userRef.current, 'inventory.read') && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPage('products')
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleSearchShortcut)
    return () => document.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  function signOut() {
    localStorage.removeItem('inventory-token')
    setToken(null)
    setUser(null)
    setProducts([])
    setCategories([])
    setTeam({ users: [], invitations: [] })
    setMovements([])
    setSummary(null)
    setConfirmation(null)
    setModal('')
  }

  async function signIn(email, password) {
    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    activateSession(result)
  }

  function activateSession(result) {
    localStorage.setItem('inventory-token', result.token)
    setUser(result.user)
    setToken(result.token)
  }

  async function acceptInvitation(invitationToken, password) {
    const result = await request('/auth/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: invitationToken, password }),
    })
    window.history.replaceState({}, '', window.location.pathname)
    setInviteToken(null)
    activateSession(result)
  }

  function cancelInvitation() {
    window.history.replaceState({}, '', window.location.pathname)
    setInviteToken(null)
  }

  async function sendInvitation(values) {
    const result = await request('/auth/invitations', { method: 'POST', token, body: JSON.stringify(values) })
    setInvitePreview(result.invitationUrl || '')
    setNotice(result.message || 'Invitation sent')
    await loadData()
    return result
  }

  async function saveProduct(values) {
    const editingProduct = editing
    await request(editingProduct ? `/products/${editingProduct._id}` : '/products', {
      method: editingProduct ? 'PATCH' : 'POST',
      token,
      body: JSON.stringify(values),
    })
    setModal('')
    setEditing(null)
    setNotice(editingProduct ? 'Product updated' : 'Product added to inventory')
    await loadData()
  }

  async function archiveProduct(product) {
    setConfirmation({
      title: `Archive ${product.name}?`,
      message: 'This product will leave active inventory. Its stock movement history will be preserved.',
      confirmLabel: 'Archive product',
      onConfirm: async () => {
        await request(`/products/${product._id}/archive`, { method: 'PATCH', token })
        setNotice('Product archived')
        await loadData()
      },
    })
  }

  async function saveCategory(values) {
    await request('/categories', { method: 'POST', token, body: JSON.stringify(values) })
    setModal('')
    setNotice('Category created')
    await loadData()
  }

  async function removeCategory(category) {
    setConfirmation({
      title: `Delete ${category.name}?`,
      message: 'This category can only be deleted if no products are assigned to it.',
      confirmLabel: 'Delete category',
      onConfirm: async () => {
        await request(`/categories/${category._id}`, { method: 'DELETE', token })
        setNotice('Category deleted')
        await loadData()
      },
    })
  }

  async function saveMovement(values) {
    await request('/movements', { method: 'POST', token, body: JSON.stringify(values) })
    setModal('')
    setNotice('Stock movement recorded')
    await loadData()
  }

  function openMovement(type = 'in', initialProductId = '') {
    if (!products.length) {
      setPage('products')
      setNotice('Add a product before recording stock.')
      return
    }
    setMovementType(type)
    setInitialMovementProduct(initialProductId)
    setModal('movement')
  }

  function navigateTo(target) {
    const permission = pagePermissions[target]
    if (!permission || canUser(user, permission)) setPage(target)
  }

  function copyInviteLink() {
    if (!navigator.clipboard) {
      setNotice('Copy the invitation URL shown above')
      return
    }

    navigator.clipboard.writeText(invitePreview)
      .then(() => setNotice('Invitation link copied'))
      .catch(() => setNotice('Copy the invitation URL shown above'))
  }

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesTerm = !term || `${product.name} ${product.sku} ${product.category?.name || ''}`.toLowerCase().includes(term)
      const matchesFilter = filter === 'all' || (filter === 'low' ? product.quantity <= product.lowStockThreshold : product.category?._id === filter)
      return matchesTerm && matchesFilter
    })
  }, [products, search, filter])

  if (inviteToken) return <InviteAcceptanceScreen invitationToken={inviteToken} onAccept={acceptInvitation} onCancel={cancelInvitation} />
  if (!token) return <LoginScreen onLogin={signIn} />

  return (
    <div className="app-shell">
      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setPage('overview') }}>
          <Brand />
        </a>
        <div className="workspace-label">INVENTORY WORKSPACE</div>
        <nav className="main-nav">
          {navigation.filter((item) => !item.permission || canUser(user, item.permission)).map((item) => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => { setPage(item.id); setMobileNav(false) }}><span className="nav-icon"><Icon name={item.id === 'stock-in' || item.id === 'stock-out' ? 'stock' : item.id} /></span>{item.label}{item.id === 'products' && summary?.lowStockCount > 0 && <span className="nav-badge">{summary.lowStockCount}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          {canUser(user, 'products.manage') && <div className="help-card"><div className="help-icon"><Icon name="boxes" /></div><strong>Inventory quick start</strong><p>Add products and categories, then record each stock change to keep your history accurate.</p><button onClick={() => { setPage('products'); setMobileNav(false); setEditing(null); setModal('product') }}>Add your first product <Icon name="arrow" size={14} /></button></div>}
          <div className="profile"><span className="profile-avatar">{user?.name?.slice(0, 1) || 'A'}</span><span className="profile-copy"><strong>{user?.name || 'Administrator'}</strong><small>{user?.email}</small></span><button className="profile-logout" aria-label="Sign out" title="Sign out" onClick={signOut}><Icon name="logout" size={16} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><span /><span /><span /></button>
          <div className="breadcrumbs"><span>StockRoom</span><span className="crumb-slash">/</span><strong>{page === 'category-detail' ? categories.find((category) => category._id === selectedCategoryId)?.name || 'Category details' : navigation.find((item) => item.id === page)?.label || 'Overview'}</strong></div>
          <div className="topbar-actions">{canUser(user, 'inventory.read') && <><label className="global-search"><Icon name="search" size={16} /><input ref={searchRef} aria-label="Search products" placeholder="Search products" value={search} onChange={(event) => { setSearch(event.target.value); if (page !== 'products') navigateTo('products') }} /><kbd>⌘ K</kbd></label><button className="icon-button low-stock-shortcut" aria-label="View low-stock products" title="View low-stock products" onClick={() => { setFilter('low'); navigateTo('products') }}><span>!</span>{summary?.lowStockCount > 0 && <i />}</button><span className="topbar-divider" /></>}<span className="topbar-avatar" aria-label={user?.name || 'Administrator'}>{user?.name?.slice(0, 1) || 'A'}</span></div>
        </header>

        <div className="page-content">
          {error && <div className="alert-error" role="alert"><span>{error}</span><button onClick={() => loadData()}>Retry</button><button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
          {invitePreview && <div className="invitation-preview" role="status"><div><strong>Local invitation link</strong><span>{invitePreview}</span></div><button onClick={copyInviteLink}>Copy link</button><button aria-label="Dismiss invitation link" onClick={() => setInvitePreview('')}>×</button></div>}
          {page === 'overview' && <Overview summary={summary} products={products} categories={categories} movements={movements} onNavigate={navigateTo} canViewInventory={canUser(user, 'inventory.read')} canViewHistory={canUser(user, 'movements.read')} onAddProduct={canUser(user, 'products.manage') ? () => { setEditing(null); setModal('product') } : undefined} onRecordStock={canUser(user, 'movements.in') ? () => openMovement('in') : undefined} loading={busy} />}
          {page === 'products' && canUser(user, 'inventory.read') && <ProductsPage products={filteredProducts} categories={categories} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onAdd={canUser(user, 'products.manage') ? () => { setEditing(null); setModal('product') } : undefined} onEdit={canUser(user, 'products.manage') ? (product) => { setEditing(product); setModal('product') } : undefined} onArchive={canUser(user, 'products.manage') ? archiveProduct : undefined} canManage={canUser(user, 'products.manage')} />}
          {page === 'categories' && canUser(user, 'inventory.read') && <CategoriesPage categories={categories} products={products} onAdd={canUser(user, 'categories.manage') ? () => setModal('category') : undefined} onDelete={canUser(user, 'categories.manage') ? removeCategory : undefined} onOpen={(category) => { setSelectedCategoryId(category._id); setPage('category-detail') }} canManage={canUser(user, 'categories.manage')} />}
          {page === 'category-detail' && selectedCategoryId && canUser(user, 'inventory.read') && <CategoryDetailPage categoryId={selectedCategoryId} token={token} request={request} onBack={() => setPage('categories')} onRecord={(type, productId) => openMovement(type, productId)} canIn={canUser(user, 'movements.in')} canOut={canUser(user, 'movements.out')} />}
          {page === 'stock' && canUser(user, 'movements.read') && <StockPage products={products} movements={movements} onRecord={openMovement} onNavigate={navigateTo} canIn={canUser(user, 'movements.in')} canOut={canUser(user, 'movements.out')} canAdjust={canUser(user, 'movements.adjust')} />}
          {page === 'stock-in' && canUser(user, 'movements.in') && <StockFlowPage type="in" products={products} token={token} request={request} onRecord={openMovement} onNavigate={navigateTo} canViewHistory={canUser(user, 'movements.read')} canViewEntry={canUser(user, 'movements.read')} canIn={canUser(user, 'movements.in')} canOut={canUser(user, 'movements.out')} />}
          {page === 'stock-out' && canUser(user, 'movements.out') && <StockFlowPage type="out" products={products} token={token} request={request} onRecord={openMovement} onNavigate={navigateTo} canViewHistory={canUser(user, 'movements.read')} canViewEntry={canUser(user, 'movements.read')} canIn={canUser(user, 'movements.in')} canOut={canUser(user, 'movements.out')} />}
          {page === 'history' && canUser(user, 'movements.read') && <MovementHistoryPage token={token} request={request} categories={categories} products={products} />}
          {page === 'reports' && canUser(user, 'reports.read') && <ReportsDashboard token={token} request={request} summary={summary} />}
          {page === 'team' && canUser(user, 'team.manage') && <TeamManagementPage team={team} currentUserId={user?._id} onInvite={sendInvitation} onUpdate={async (id, values) => { await request(`/auth/team/${id}`, { method: 'PATCH', token, body: JSON.stringify(values) }); await loadData() }} onResend={async (id) => { const result = await request(`/auth/invitations/${id}/resend`, { method: 'POST', token }); setInvitePreview(result.invitationUrl || ''); setNotice(result.message); await loadData() }} onRevoke={async (id) => { await request(`/auth/invitations/${id}`, { method: 'DELETE', token }); setInvitePreview(''); setNotice('Invitation revoked'); await loadData() }} />}
          {page !== 'overview' && page !== 'products' && page !== 'categories' && page !== 'category-detail' && page !== 'stock' && page !== 'stock-in' && page !== 'stock-out' && page !== 'history' && page !== 'reports' && page !== 'team' && <section className="panel"><p className="advanced-error">This page is unavailable for your account permissions.</p></section>}
          {pagePermissions[page] && !canUser(user, pagePermissions[page]) && <section className="panel"><p className="advanced-error">This page is unavailable for your account permissions.</p></section>}
        </div>
      </main>

      {modal === 'product' && <ProductModal product={editing} categories={categories} onClose={() => { setModal(''); setEditing(null) }} onSave={saveProduct} />}
      {modal === 'category' && <CategoryModal onClose={() => setModal('')} onSave={saveCategory} />}
      {modal === 'movement' && <MovementModal products={products} initialType={movementType} initialProductId={initialMovementProduct} allowedTypes={['in', 'out', 'adjustment'].filter((type) => canUser(user, type === 'in' ? 'movements.in' : type === 'out' ? 'movements.out' : 'movements.adjust'))} onClose={() => setModal('')} onSave={saveMovement} />}
      {confirmation && <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} onError={setError} />}
      {notice && <div className="toast" role="status"><span className="toast-check">✓</span>{notice}</div>}
      {busy && <div className="sync-status"><span /> Syncing inventory</div>}
    </div>
  )
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onLogin(email, password)
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <aside className="login-art" aria-label="StockRoom inventory management">
        <a className="login-art-top" href="/" aria-label="StockRoom home"><Brand /></a>
        <div className="login-art-content">
          <span className="eyebrow">WHOLESALE INVENTORY, SIMPLIFIED</span>
          <h1>Know what’s<br />in <em>stock.</em></h1>
          <p>One clear view of your products, stock levels, and every movement through your business.</p>
          <div className="login-art-card">
            <div className="login-art-card-icon"><Icon name="boxes" size={26} /></div>
            <div><strong>Everything in its place.</strong><span>Products · Categories · Stock history</span></div>
            <Icon name="arrow" size={18} />
          </div>
          <div className="login-art-decoration" aria-hidden="true"><span /><span /><span /></div>
        </div>
        <div className="login-art-footer"><span>Inventory, in good order.</span><span>StockRoom</span></div>
      </aside>

      <main className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="mobile-brand"><Brand /></div>
          <span className="eyebrow">ADMINISTRATOR ACCESS</span>
          <h2>Welcome back</h2>
          <p className="login-subtitle">Sign in to manage your wholesale inventory.</p>

          <label className="field-label" htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            placeholder="you@yourbusiness.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label className="field-label" htmlFor="login-password">Password</label>
          <div className="password-field">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && <div className="form-error login-error" role="alert">{error}</div>}
          <button className="primary-button login-submit" disabled={busy}>
            {busy ? <><span className="loading-spinner" aria-hidden="true" />Signing in…</> : <>Sign in <Icon name="arrow" size={17} /></>}
          </button>
          <p className="login-help">Need an account? Ask your workspace administrator for an invitation.</p>
        </form>
      </main>
    </div>
  )
}

function InviteAcceptanceScreen({ invitationToken, onAccept, onCancel }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await onAccept(invitationToken, password)
    } catch (acceptError) {
      setError(acceptError.message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="login-screen"><div className="login-panel"><form className="login-form" onSubmit={submit}><div className="mobile-brand"><Brand /></div><span className="eyebrow">ADMINISTRATOR INVITATION</span><h2>Set up your account</h2><p className="login-subtitle">Choose a password to join this StockRoom workspace.</p><label className="field-label" htmlFor="invite-password">Password</label><input id="invite-password" type="password" autoComplete="new-password" minLength="12" required placeholder="At least 12 characters" value={password} onChange={(event) => setPassword(event.target.value)} /><label className="field-label" htmlFor="invite-confirmation">Confirm password</label><input id="invite-confirmation" type="password" autoComplete="new-password" minLength="12" required placeholder="Enter your password again" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? 'Setting up…' : 'Accept invitation'} <Icon name="arrow" size={16} /></button><button className="text-button invite-back" type="button" onClick={onCancel}>Return to sign in</button></form></div></div>
}

function PageHeading({ eyebrow, title, description, action, actionLabel }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <button className="primary-button" onClick={action}><Icon name="plus" size={16} />{actionLabel}</button>}</div>
}

function Overview({ summary, products, categories, movements, onNavigate, canViewInventory, canViewHistory, onAddProduct, onRecordStock, loading }) {
  const lowStock = products.filter((product) => product.quantity <= product.lowStockThreshold).slice(0, 4)
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
  return (
    <>
      <PageHeading eyebrow={today} title="Inventory overview" description="A live snapshot of your wholesale inventory." action={onRecordStock} actionLabel="Record stock" />
      <div className="welcome-strip">
        <div className="welcome-text">
          <div className="welcome-tag">YOUR BUSINESS, AT A GLANCE</div>
          <h2>Everything in its right place.</h2>
          <p>Review stock levels, spot items to replenish, and keep every movement accounted for.</p>
        </div>
        <div className="welcome-illustration" aria-hidden="true"><Icon name="boxes" size={68} /></div>
      </div>
      <div className="section-heading">
        <div><h2>Inventory summary</h2><p>Metrics calculated from your active catalog.</p></div>
        {canViewInventory && <button className="text-button" onClick={() => onNavigate('products')}>View products <Icon name="arrow" size={14} /></button>}
      </div>
      <div className="metrics-grid">
        <MetricCard label="Active products" value={summary?.totalProducts ?? (loading ? '—' : '0')} note="In your product catalog" icon="products" tone="lavender" />
        <MetricCard label="Categories" value={summary?.totalCategories ?? categories.length} note="Organizing your catalog" icon="categories" tone="blue" />
        <MetricCard label="Stock on hand" value={summary?.totalUnits ?? (loading ? '—' : '0')} note="Units across active products" icon="stock" tone="peach" />
        <MetricCard label="Inventory value" value={summary ? currency.format(summary.inventoryValue) : loading ? '—' : currency.format(0)} note="At current unit cost" icon="currency" tone="mint" />
        <MetricCard label="Low-stock products" value={summary?.lowStockCount ?? (loading ? '—' : '0')} note="At or below their threshold" icon="warning" tone="yellow" alert={summary?.lowStockCount > 0} onClick={canViewInventory ? () => onNavigate('products') : undefined} />
      </div>
      <div className="dashboard-grid">
        <section className="panel inventory-panel">
          <div className="panel-heading">
            <div><h3>Needs replenishment</h3><p>Products at or below their configured threshold.</p></div>
            {canViewInventory && <button className="round-arrow" aria-label="View low-stock products" onClick={() => onNavigate('products')}><Icon name="arrow" size={16} /></button>}
          </div>
          {lowStock.length
            ? <div className="compact-list">{lowStock.map((product) => <div className="compact-row" key={product._id}><ProductAvatar name={product.name} /><div className="compact-product"><strong>{product.name}</strong><small>{product.sku}</small></div><div className="stock-meter"><span className="stock-meter-label">{product.quantity} / {product.lowStockThreshold}</span><span className="meter-track"><i style={{ width: `${Math.min(100, product.quantity / Math.max(product.lowStockThreshold, 1) * 100)}%` }} /></span></div><span className="low-chip">Low stock</span></div>)}</div>
            : <EmptyState title={loading ? 'Loading inventory' : products.length ? 'No restock needed' : 'No products yet'} body={loading ? 'Inventory metrics are being refreshed.' : products.length ? 'No active products are at or below their threshold.' : 'Add a product to begin tracking stock.'} />}
        </section>
        <section className="panel movement-panel">
          <div className="panel-heading">
            <div><h3>Recent activity</h3><p>Latest stock changes recorded.</p></div>
            {canViewHistory && <button className="text-button" onClick={() => onNavigate('history')}>Movement history <Icon name="arrow" size={14} /></button>}
          </div>
          {movements.slice(0, 5).length
            ? <div className="activity-list">{movements.slice(0, 5).map((movement) => <ActivityRow movement={movement} key={movement._id} />)}</div>
            : <EmptyState title="No movements yet" body="Recorded stock changes will appear here." />}
        </section>
      </div>
      {onAddProduct && <div className="bottom-prompt">
        <div className="prompt-sparkle"><Icon name="plus" size={18} /></div>
        <div><strong>Build your product catalog</strong><p>Add grocery items with pack sizes, pricing, and stock thresholds.</p></div>
        <button className="text-button" onClick={onAddProduct}>Add a product <Icon name="arrow" size={14} /></button>
      </div>}
      <p className="dashboard-footnote">{summary?.todayMovementCount ?? 0} stock movements recorded today.</p>
    </>
  )
}

function MetricCard({ label, value, note, icon, tone, alert, onClick }) {
  const content = <>
    <span className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}>{icon === 'currency' ? '₹' : icon === 'warning' ? '!' : <Icon name={icon} size={17} />}</span></span>
    <span className="metric-value">{value}</span>
    <span className={`metric-note ${alert ? 'metric-alert' : ''}`}><span className="metric-note-dot" />{note}</span>
  </>
  return onClick
    ? <button className="metric-card metric-card-button" onClick={onClick} aria-label={`${label}: ${value}. View products.`}>{content}</button>
    : <div className="metric-card">{content}</div>
}

function ProductsPage({ products, categories, search, setSearch, filter, setFilter, onAdd, onEdit, onArchive, canManage }) {
  const [sort, setSort] = useState('name-asc')
  const [page, setPage] = useState(1)
  const sortedProducts = [...products].sort((left, right) => {
    if (sort === 'name-desc') return right.name.localeCompare(left.name)
    if (sort === 'quantity-asc') return left.quantity - right.quantity
    if (sort === 'quantity-desc') return right.quantity - left.quantity
    if (sort === 'price-asc') return left.unitPrice - right.unitPrice
    if (sort === 'price-desc') return right.unitPrice - left.unitPrice
    return left.name.localeCompare(right.name)
  })
  const visibleProducts = sortedProducts.slice((page - 1) * pageSize, page * pageSize)

  function clearFilters() {
    setSearch('')
    setFilter('all')
    setSort('name-asc')
    setPage(1)
  }

  return (
    <>
      <PageHeading eyebrow="PRODUCT CATALOG" title="Products" description="Manage wholesale items, pack sizes, prices, and restock thresholds." action={onAdd} actionLabel="Add product" />
      <section className="panel table-panel">
        <div className="table-toolbar">
          <label className="toolbar-search"><Icon name="search" size={16} /><input aria-label="Search products by name, SKU, or category" placeholder="Search name, SKU, or category" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
          <select aria-label="Filter products by category or stock status" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1) }}>
            <option value="all">All products</option><option value="low">Low stock</option>
            {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
          </select>
          <select aria-label="Sort products" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}>
            <option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option>
            <option value="quantity-asc">Stock: lowest</option><option value="quantity-desc">Stock: highest</option>
            <option value="price-asc">Price: lowest</option><option value="price-desc">Price: highest</option>
          </select>
          <span className="result-count">{products.length} {products.length === 1 ? 'product' : 'products'}</span>
          {(search || filter !== 'all' || sort !== 'name-asc') && <button className="text-button clear-filters" onClick={clearFilters}>Clear filters</button>}
        </div>
        {visibleProducts.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>ON HAND</th><th>UNIT PRICE</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{visibleProducts.map((product) => {
                  const low = product.quantity <= product.lowStockThreshold
                  return (
                    <tr key={product._id}>
                      <td><div className="table-product"><ProductAvatar name={product.name} /><span><strong>{product.name}</strong><small>{[product.brand, product.packSize && product.packUnit ? `${product.packSize} ${product.packUnit}` : '', product.description].filter(Boolean).join(' · ') || '—'}</small></span></div></td>
                      <td className="sku-cell">{product.sku}</td>
                      <td><span className="category-pill">{product.category?.name || 'Uncategorized'}</span></td>
                      <td><strong>{product.quantity}</strong> <span className="muted">{product.unit || 'units'}</span></td>
                      <td>{currency.format(product.unitPrice)}</td>
                      <td><span className={`status-pill ${low ? 'status-low' : 'status-good'}`}><i />{low ? 'Low stock' : 'In stock'}</span></td>
                      {canManage && <td><div className="row-actions"><button onClick={() => onEdit(product)}>Edit</button><button aria-label={`Archive ${product.name}`} onClick={() => onArchive(product)}>Archive</button></div></td>}
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
            <Pagination page={page} setPage={setPage} totalItems={products.length} />
          </>
        ) : <EmptyState title={search || filter !== 'all' ? 'No matching products' : 'No products yet'} body={search || filter !== 'all' ? 'Try changing or clearing your search and filters.' : 'Add your first product to start tracking inventory.'} />}
      </section>
    </>
  )
}

function CategoriesPage({ categories, products, onAdd, onDelete, onOpen, canManage }) {
  const [search, setSearch] = useState('')
  const filteredCategories = categories.filter((category) => `${category.name} ${category.description}`.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <>
      <PageHeading eyebrow="PRODUCT ORGANIZATION" title="Categories" description="Group grocery products so the catalog is easier to browse." action={onAdd} actionLabel="Add category" />
      <div className="category-toolbar">
        <label className="toolbar-search"><Icon name="search" size={16} /><input aria-label="Search categories" placeholder="Search categories" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {search && <button className="text-button" onClick={() => setSearch('')}>Clear search</button>}
        <span className="result-count">{filteredCategories.length} {filteredCategories.length === 1 ? 'category' : 'categories'}</span>
      </div>
      {filteredCategories.length ? (
        <div className="category-grid">
          {filteredCategories.map((category, index) => {
            const count = category.summary?.totalProducts ?? products.filter((product) => product.category?._id === category._id).length
            return (
              <article className="category-card" key={category._id}>
                <button className="category-card-open" onClick={() => onOpen(category)} aria-label={`View products in ${category.name}`}>
                  <div className={`category-art category-art-${index % 4}`}><Icon name="categories" size={34} /></div>
                  <div className="category-card-info"><div><h3>{category.name}</h3><p>{category.description || 'No description added.'}</p></div><span className="category-count">{count} {count === 1 ? 'product' : 'products'} · {category.summary?.totalUnits ?? 0} units</span></div>
                </button>
                {canManage && <button className="category-delete" aria-label={`Delete ${category.name}`} onClick={() => onDelete(category)}><Icon name="close" size={16} /></button>}
              </article>
            )
          })}
          {canManage && <button className="category-add-card" onClick={onAdd}><span><Icon name="plus" /></span><strong>Create a category</strong><small>Organize your products</small></button>}
        </div>
      ) : <section className="panel"><EmptyState title={search ? 'No matching categories' : 'No categories yet'} body={search ? 'Try another category name or clear the search.' : 'Create a category to organize your product catalog.'} /></section>}
    </>
  )
}

function StockPage({ products, movements, onRecord, onNavigate, canIn, canOut, canAdjust }) {
  const movementTotals = movements.reduce((totals, movement) => {
    totals[movement.type] += movement.quantity
    return totals
  }, { in: 0, out: 0, adjustment: 0 })

  return (
    <>
      <StockEntryTabs active="stock" onNavigate={onNavigate} canIn={canIn} canOut={canOut} />
      <PageHeading eyebrow="INVENTORY OPERATIONS" title="Stock entry" description="Record incoming goods, outgoing stock, and count corrections." action={canIn ? () => onRecord('in') : undefined} actionLabel="New stock entry" />
      <div className="stock-intro"><div className="stock-intro-icon"><Icon name="stock" size={23} /></div><div><h2>Keep every stock change accounted for.</h2><p>Use a movement entry for all quantity changes. It updates the product level and creates a history record.</p></div></div>
      <div className="stock-action-grid">
        {canIn && <button className="stock-action-card stock-in" onClick={() => onRecord('in')}><span className="action-symbol">↓</span><span className="eyebrow">GOODS ARRIVING</span><strong>Stock in</strong><small>Record a delivery or supplier restock.</small><span className="action-link">Record incoming stock <b>→</b></span></button>}
        {canOut && <button className="stock-action-card stock-out" onClick={() => onRecord('out')}><span className="action-symbol">↑</span><span className="eyebrow">GOODS LEAVING</span><strong>Stock out</strong><small>Record a dispatch, damaged item, or other outgoing stock.</small><span className="action-link">Record outgoing stock <b>→</b></span></button>}
        {canAdjust && <button className="stock-action-card stock-adjust" onClick={() => onRecord('adjustment')}><span className="action-symbol">⌁</span><span className="eyebrow">COUNT CORRECTION</span><strong>Adjust quantity</strong><small>Set the actual on-hand count after a stocktake.</small><span className="action-link">Record a correction <b>→</b></span></button>}
      </div>
      <section className="panel stock-summary">
        <div className="panel-heading"><div><h3>Recent movement totals</h3><p>Quantities across the latest {movements.length} movement records loaded.</p></div><button className="text-button" onClick={() => onNavigate('history')}>View history <Icon name="arrow" size={14} /></button></div>
        <div className="stock-today-stats">
          <div><span>Stock in</span><strong>+{movementTotals.in} <small>units</small></strong></div>
          <div><span>Stock out</span><strong>−{movementTotals.out} <small>units</small></strong></div>
          <div><span>Active products</span><strong>{products.length} <small>items</small></strong></div>
        </div>
      </section>
    </>
  )
}

function Pagination({ page, setPage, totalItems }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalItems <= pageSize) return null
  return (
    <nav className="pagination" aria-label="Pagination">
      <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems}</span>
      <div><button className="secondary-button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span aria-live="polite">Page {page} of {totalPages}</span><button className="secondary-button" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div>
    </nav>
  )
}

function ActivityRow({ movement, detailed = false }) {
  const type = movement.type === 'in' ? 'in' : movement.type === 'out' ? 'out' : 'adjustment'
  const label = type === 'in' ? 'Stock in' : type === 'out' ? 'Stock out' : 'Adjustment'
  const labelIcon = type === 'in' ? '↓' : type === 'out' ? '↑' : '↔'
  return (
    <div className={`activity-row ${detailed ? 'activity-detailed' : ''}`}>
      <span className={`movement-icon movement-${type}`} aria-label={label}>{labelIcon}</span>
      <div className="activity-copy">
        <strong>{movement.product?.name || 'Product removed'}</strong>
        <small>{movement.product?.sku ? `${movement.product.sku} · ` : ''}{label}{movement.note ? ` · ${movement.note}` : ''}{detailed && movement.createdBy?.name ? ` · by ${movement.createdBy.name}` : ''}</small>
        {detailed && <small>Stock: {movement.previousStock} → {movement.newStock} {movement.product?.unit || 'units'}</small>}
      </div>
      <span className={`movement-quantity movement-quantity-${type}`}>{type === 'in' ? '+' : type === 'out' ? '−' : '↔'}{movement.quantity} <small>units</small></span>
      <span className="activity-date">{new Date(movement.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}<small>{new Date(movement.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small></span>
    </div>
  )
}

function ProductAvatar({ name = 'Product' }) {
  const colors = ['avatar-lavender', 'avatar-yellow', 'avatar-mint', 'avatar-peach', 'avatar-blue']
  const color = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length
  return <span className={`product-avatar ${colors[color]}`}>{name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
}

function EmptyState({ title, body }) {
  return <div className="empty-state"><span>✳</span><strong>{title}</strong><p>{body}</p></div>
}

function Modal({ title, subtitle, onClose, children, onSubmit, submitLabel = 'Save changes' }) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return
    setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    setSubmitting(true)
    try {
      await onSubmit(values)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" onSubmit={handleSubmit}>
        <div className="modal-heading"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button type="button" className="modal-close" aria-label="Close dialog" disabled={submitting} onClick={onClose}><Icon name="close" size={17} /></button></div>
        {children}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="secondary-button" disabled={submitting} onClick={onClose}>Cancel</button><button className="primary-button" disabled={submitting}>{submitting && <span className="loading-spinner" aria-hidden="true" />}{submitting ? 'Saving…' : submitLabel}<Icon name="arrow" size={15} /></button></div>
      </form>
    </div>
  )
}

function ConfirmDialog({ confirmation, onClose, onError }) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      await confirmation.onConfirm()
      onClose()
    } catch (error) {
      onError(error.message)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-icon"><Icon name="warning" size={21} /></div>
        <h2 id="confirm-title">{confirmation.title}</h2>
        <p id="confirm-message">{confirmation.message}</p>
        <div className="modal-actions">
          <button className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="danger-button" disabled={busy} onClick={confirm}>{busy ? 'Working…' : confirmation.confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

function ProductModal({ product, categories, onClose, onSave }) {
  return (
    <Modal title={product ? 'Edit product details' : 'Add a product'} subtitle={product ? 'Stock levels are changed through stock movements.' : 'Add product details and, optionally, opening stock.'} onClose={onClose} onSubmit={onSave} submitLabel={product ? 'Save product' : 'Add product'}>
      {product && <div className="current-stock-note"><Icon name="stock" size={17} /><span>Current stock: <strong>{product.quantity} {product.unit || 'units'}</strong>. Use Stock entry to record a quantity change.</span></div>}
      <div className="form-grid">
        <label className="form-field field-wide">Product name<input name="name" required maxLength="120" defaultValue={product?.name || ''} placeholder="e.g. Basmati Rice" /></label>
        <label className="form-field">SKU<input name="sku" required maxLength="40" defaultValue={product?.sku || ''} placeholder="e.g. GRA001" /></label>
        <label className="form-field">Category<select name="category" defaultValue={product?.category?._id || ''}><option value="">Uncategorized</option>{categories.map((category) => <option value={category._id} key={category._id}>{category.name}</option>)}</select></label>
        <label className="form-field">Brand<input name="brand" maxLength="80" defaultValue={product?.brand || ''} placeholder="e.g. Generic" /></label>
        <label className="form-field">Wholesale unit<input name="unit" maxLength="40" defaultValue={product?.unit || ''} placeholder="e.g. bag, tin, carton" /></label>
        <label className="form-field">Pack size<input name="packSize" type="number" min="0.01" step="0.01" defaultValue={product?.packSize ?? ''} placeholder="e.g. 25" /></label>
        <label className="form-field">Pack unit<input name="packUnit" maxLength="40" defaultValue={product?.packUnit || ''} placeholder="e.g. kg, litre" /></label>
        <label className="form-field">Unit price (INR)<input name="unitPrice" type="number" min="0" step="0.01" required defaultValue={product?.unitPrice ?? ''} placeholder="0.00" /></label>
        <label className="form-field">Unit cost (INR)<input name="unitCost" type="number" min="0" step="0.01" required defaultValue={product?.unitCost ?? ''} placeholder="0.00" /></label>
        {!product && <label className="form-field">Opening quantity<input name="quantity" type="number" min="0" step="1" required defaultValue="0" /><small>A positive opening balance is added to movement history.</small></label>}
        <label className="form-field">Low-stock threshold<input name="lowStockThreshold" type="number" min="0" step="1" required defaultValue={product?.lowStockThreshold ?? '5'} /></label>
        <label className="form-field field-wide">Description<textarea name="description" maxLength="500" rows="2" defaultValue={product?.description || ''} placeholder="Product details for your team" /></label>
      </div>
    </Modal>
  )
}

function CategoryModal({ onClose, onSave }) {
  return <Modal title="Make a new category" subtitle="Keep your catalog tidy and easy to browse." onClose={onClose} onSubmit={onSave} submitLabel="Create category"><div className="form-grid"><label className="form-field field-wide">Category name<input name="name" required placeholder="e.g. Home & living" /></label><label className="form-field field-wide">A little description<textarea name="description" rows="3" placeholder="What kind of products belong here?" /></label></div></Modal>
}

function MovementModal({ products, initialType, initialProductId, allowedTypes, onClose, onSave }) {
  const [type, setType] = useState(initialType)
  const [productId, setProductId] = useState(initialProductId)
  const [quantity, setQuantity] = useState('')
  const selectedProduct = products.find((product) => product._id === productId)
  const enteredQuantity = Number(quantity)
  const resultingQuantity = selectedProduct
    ? type === 'in' ? selectedProduct.quantity + enteredQuantity
      : type === 'out' ? selectedProduct.quantity - enteredQuantity
        : enteredQuantity
    : null

  return (
    <Modal title="Record a stock movement" subtitle="A movement updates on-hand stock and adds an audit-history entry." onClose={onClose} onSubmit={onSave} submitLabel="Save movement">
      <div className="form-grid">
        {allowedTypes.length > 1 && <label className="form-field field-wide">Movement type<select name="type" value={type} onChange={(event) => { setType(event.target.value); setQuantity('') }}>{allowedTypes.includes('in') && <option value="in">Stock in — goods received</option>}{allowedTypes.includes('out') && <option value="out">Stock out — goods dispatched</option>}{allowedTypes.includes('adjustment') && <option value="adjustment">Adjustment — counted on-hand total</option>}</select></label>}
        <label className="form-field field-wide">Product<select name="product" required value={productId} onChange={(event) => setProductId(event.target.value)}><option value="" disabled>Select a product</option>{products.map((product) => <option value={product._id} key={product._id}>{product.name} · {product.quantity} {product.unit || 'units'} available</option>)}</select></label>
        {selectedProduct && <div className="movement-preview"><span>Current on hand</span><strong>{selectedProduct.quantity} {selectedProduct.unit || 'units'}</strong></div>}
        <label className="form-field field-wide">{type === 'adjustment' ? 'New counted quantity' : 'Quantity'}<input name="quantity" type="number" min={type === 'adjustment' ? '0' : '1'} step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={type === 'adjustment' ? 'Enter the physical count' : 'Enter a whole number'} />{type === 'adjustment' && <small>Enter the new total count, not the difference.</small>}</label>
        {selectedProduct && Number.isInteger(enteredQuantity) && enteredQuantity >= 0 && (type === 'adjustment' || enteredQuantity > 0) && <div className={`movement-preview movement-result${resultingQuantity < 0 ? ' movement-result-error' : ''}`}><span>Expected on hand</span><strong>{resultingQuantity} {selectedProduct.unit || 'units'}</strong></div>}
        {type !== 'adjustment' && <label className="form-field field-wide">Supplier or dispatch reference (optional)<input name="reference" maxLength="120" placeholder={type === 'in' ? 'e.g. supplier invoice or delivery number' : 'e.g. retailer order or dispatch number'} /></label>}
        <label className="form-field field-wide">{type === 'adjustment' ? 'Adjustment reason (required)' : 'Note (optional)'}<textarea name="note" maxLength="240" rows="2" required={type === 'adjustment'} placeholder={type === 'adjustment' ? 'Explain why the count is changing' : 'Additional context for the movement'} /></label>
        {resultingQuantity !== null && resultingQuantity < 0 && <p className="inline-error field-wide">This stock-out exceeds the available quantity.</p>}
      </div>
    </Modal>
  )
}

export default App
