import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

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
  overview: '▦',
  products: '▣',
  categories: '◫',
  stock: '⇄',
  history: '◷',
  search: '⌕',
  bell: '♧',
  team: '♙',
  plus: '+',
  arrow: '↗',
}

const navigation = [
  { id: 'overview', label: 'Overview', icon: icons.overview },
  { id: 'products', label: 'Products', icon: icons.products },
  { id: 'categories', label: 'Categories', icon: icons.categories },
  { id: 'stock', label: 'Stock entry', icon: icons.stock },
  { id: 'history', label: 'Movement history', icon: icons.history },
  { id: 'team', label: 'Team', icon: icons.team },
]

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('inventory-token'))
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'))
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('overview')
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [admins, setAdmins] = useState([])
  const [movements, setMovements] = useState([])
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState('')
  const [editing, setEditing] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)

  const loadData = useCallback(async (activeToken = token) => {
    if (!activeToken) return
    setBusy(true)
    setError('')
    try {
      const [productData, categoryData, movementData, dashboardData, adminData] = await Promise.all([
        request('/products', { token: activeToken }),
        request('/categories', { token: activeToken }),
        request('/movements?limit=50', { token: activeToken }),
        request('/dashboard', { token: activeToken }),
        request('/auth/admins', { token: activeToken }),
      ])
      setProducts(productData.products)
      setCategories(categoryData.categories)
      setMovements(movementData.movements)
      setSummary(dashboardData)
      setAdmins(adminData.admins)
    } catch (requestError) {
      setError(requestError.message)
      if (requestError.status === 401) signOut()
    } finally {
      setBusy(false)
    }
  }, [token])

  useEffect(() => {
    if (token) {
      request('/auth/me', { token })
        .then(({ user: signedInUser }) => setUser(signedInUser))
        .catch(() => signOut())
      Promise.resolve().then(() => loadData(token))
    }
  }, [token, loadData])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  function signOut() {
    localStorage.removeItem('inventory-token')
    setToken(null)
    setUser(null)
    setProducts([])
    setCategories([])
    setAdmins([])
    setMovements([])
    setSummary(null)
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
    await request('/auth/invitations', { method: 'POST', token, body: JSON.stringify(values) })
    setModal('')
    setNotice('Administrator invitation sent')
    await loadData()
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
    if (!window.confirm(`Archive ${product.name}? It will no longer appear in active inventory.`)) return
    try {
      await request(`/products/${product._id}/archive`, { method: 'PATCH', token })
      setNotice('Product archived')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function saveCategory(values) {
    await request('/categories', { method: 'POST', token, body: JSON.stringify(values) })
    setModal('')
    setNotice('Category created')
    await loadData()
  }

  async function removeCategory(category) {
    if (!window.confirm(`Delete the ${category.name} category?`)) return
    try {
      await request(`/categories/${category._id}`, { method: 'DELETE', token })
      setNotice('Category deleted')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function saveMovement(values) {
    await request('/movements', { method: 'POST', token, body: JSON.stringify(values) })
    setModal('')
    setNotice('Stock movement recorded')
    await loadData()
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
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage('overview') }}>
          <span className="brand-mark">st</span>
          <span>stockroom<span className="brand-period">.</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card"><span className="workspace-avatar">N</span><span><strong>Northstar Goods</strong><small>Free plan</small></span><span className="workspace-chevron">⌄</span></div>
        <div className="nav-label">MENU</div>
        <nav className="main-nav">
          {navigation.map((item) => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setMobileNav(false) }}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === 'products' && summary?.lowStockCount > 0 && <span className="nav-badge">{summary.lowStockCount}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon">✳</div><strong>Need a hand?</strong><p>Explore our quick start guide to get the most out of Stockroom.</p><button onClick={() => setNotice('Quick start: add products, then record stock movements.')}>View quick start <span>↗</span></button></div>
          <button className="profile" onClick={signOut}><span className="profile-avatar">{user?.name?.slice(0, 1) || 'A'}</span><span className="profile-copy"><strong>{user?.name || 'Administrator'}</strong><small>{user?.email}</small></span><span className="profile-dots">···</span></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}>☰</button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{navigation.find((item) => item.id === page)?.label || 'Overview'}</strong></div>
          <div className="topbar-actions"><label className="global-search"><span>{icons.search}</span><input aria-label="Search products" placeholder="Search anything..." value={search} onChange={(event) => { setSearch(event.target.value); if (page !== 'products') setPage('products') }} /><kbd>⌘ K</kbd></label><button className="icon-button notifications" aria-label="Notifications" onClick={() => setPage('products')}>{icons.bell}<i /></button><span className="topbar-divider" /><span className="topbar-avatar">{user?.name?.slice(0, 1) || 'A'}</span></div>
        </header>

        <div className="page-content">
          {error && <div className="alert-error" role="alert"><span>{error}</span><button onClick={() => loadData()}>Retry</button><button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
          {page === 'overview' && <Overview summary={summary} products={products} movements={movements} onNavigate={setPage} onAddProduct={() => { setEditing(null); setModal('product') }} onRecordStock={() => setModal('movement')} loading={busy} />}
          {page === 'products' && <ProductsPage products={filteredProducts} categories={categories} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onAdd={() => { setEditing(null); setModal('product') }} onEdit={(product) => { setEditing(product); setModal('product') }} onArchive={archiveProduct} />}
          {page === 'categories' && <CategoriesPage categories={categories} products={products} onAdd={() => setModal('category')} onDelete={removeCategory} />}
          {page === 'stock' && <StockPage products={products} movements={movements} onRecord={() => setModal('movement')} />}
          {page === 'history' && <HistoryPage movements={movements} />}
          {page === 'team' && <TeamPage admins={admins} onInvite={() => setModal('invite')} />}
        </div>
      </main>

      {modal === 'product' && <ProductModal product={editing} categories={categories} onClose={() => { setModal(''); setEditing(null) }} onSave={saveProduct} />}
      {modal === 'category' && <CategoryModal onClose={() => setModal('')} onSave={saveCategory} />}
      {modal === 'movement' && <MovementModal products={products} onClose={() => setModal('')} onSave={saveMovement} />}
      {modal === 'invite' && <InviteModal onClose={() => setModal('')} onSave={sendInvitation} />}
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
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await onLogin(email, password) } catch (loginError) { setError(loginError.message) } finally { setBusy(false) }
  }
  return <div className="login-screen"><div className="login-art"><div className="login-art-top"><span className="brand-mark">st</span><span>stockroom<span className="brand-period">.</span></span></div><div className="login-art-content"><span className="eyebrow">A LITTLE MORE IN CONTROL</span><h1>Good things are<br />in <em>stock.</em></h1><p>One clear view of your products, stock levels, and everything moving through your business.</p><div className="login-art-chart"><div className="chart-caption">INVENTORY HEALTH <strong>+12.8%</strong></div><div className="mini-chart"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="chart-dates"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div></div></div><div className="login-art-footer"><span>Built for the people who make things happen.</span><span>© 2026 Stockroom</span></div></div><div className="login-panel"><form className="login-form" onSubmit={submit}><div className="mobile-brand"><span className="brand-mark">st</span> stockroom<span className="brand-period">.</span></div><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your<br />workspace</h2><p className="login-subtitle">Your inventory is right where you left it.</p><label className="field-label" htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="username" required placeholder="you@yourbusiness.com" value={email} onChange={(event) => setEmail(event.target.value)} /><label className="field-label" htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} />{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span>→</span></button><p className="login-help">Need an account? Ask your workspace administrator.</p></form></div></div>
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

  return <div className="login-screen"><div className="login-panel"><form className="login-form" onSubmit={submit}><div className="mobile-brand"><span className="brand-mark">st</span> stockroom<span className="brand-period">.</span></div><span className="eyebrow">ADMINISTRATOR INVITATION</span><h2>Set up your<br />account</h2><p className="login-subtitle">Choose a password to join this Stockroom workspace.</p><label className="field-label" htmlFor="invite-password">Password</label><input id="invite-password" type="password" autoComplete="new-password" minLength="12" required placeholder="At least 12 characters" value={password} onChange={(event) => setPassword(event.target.value)} /><label className="field-label" htmlFor="invite-confirmation">Confirm password</label><input id="invite-confirmation" type="password" autoComplete="new-password" minLength="12" required placeholder="Enter your password again" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? 'Setting up…' : 'Accept invitation'} <span>→</span></button><button className="text-button" type="button" onClick={onCancel}>Return to sign in</button></form></div></div>
}

function TeamPage({ admins, onInvite }) {
  return <><PageHeading eyebrow="WORKSPACE ACCESS" title="Your team" description="Manage the administrators who can access this inventory." action={onInvite} actionLabel="Invite admin" /><section className="panel table-panel"><div className="history-list">{admins.map((admin) => <div className="activity-row" key={admin._id}><span className="profile-avatar">{admin.name.slice(0, 1).toUpperCase()}</span><div className="activity-copy"><strong>{admin.name}</strong><small>{admin.email}</small></div><span className="movement-quantity">Administrator</span></div>)}</div></section></>
}

function PageHeading({ eyebrow, title, description, action, actionLabel }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <button className="primary-button" onClick={action}><span>+</span>{actionLabel}</button>}</div>
}

function Overview({ summary, products, movements, onNavigate, onAddProduct, onRecordStock, loading }) {
  const lowStock = products.filter((product) => product.quantity <= product.lowStockThreshold).slice(0, 4)
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
  return <><PageHeading eyebrow={today} title="Good morning" description="Here's what's happening with your inventory today." action={onRecordStock} actionLabel="Record stock" /><div className="welcome-strip"><div className="welcome-orbit orbit-one" /><div className="welcome-orbit orbit-two" /><div className="welcome-text"><div className="welcome-tag">YOUR BUSINESS, AT A GLANCE</div><h2>Everything in its right place.</h2><p>A little overview of what’s moving in your shop this week.</p></div><div className="welcome-illustration"><span className="box box-back" /><span className="box box-front" /><span className="sparkle">✳</span></div></div><div className="section-heading"><div><h2>The big picture</h2><p>A quick look at your inventory health.</p></div><button className="text-button" onClick={() => onNavigate('products')}>View all products <span>→</span></button></div><div className="metrics-grid"><MetricCard label="Total products" value={summary?.totalProducts ?? (loading ? '—' : '0')} note="Active in your catalog" icon="▣" tone="lavender" /><MetricCard label="Stock on hand" value={summary?.totalUnits ?? (loading ? '—' : '0')} note="Units across all products" icon="▤" tone="peach" /><MetricCard label="Inventory value" value={currency.format(summary?.inventoryValue || 0)} note="At current unit cost" icon="$" tone="mint" /><MetricCard label="Low stock items" value={summary?.lowStockCount ?? (loading ? '—' : '0')} note="Need a little attention" icon="!" tone="yellow" alert={summary?.lowStockCount > 0} /></div><div className="dashboard-grid"><section className="panel inventory-panel"><div className="panel-heading"><div><h3>Needs a restock</h3><p>Products getting a little low.</p></div><button className="round-arrow" onClick={() => { onNavigate('products') }}>↗</button></div>{lowStock.length ? <div className="compact-list">{lowStock.map((product) => <div className="compact-row" key={product._id}><ProductAvatar name={product.name} /><div className="compact-product"><strong>{product.name}</strong><small>{product.sku}</small></div><div className="stock-meter"><span className="stock-meter-label">{product.quantity} left</span><span className="meter-track"><i style={{ width: `${Math.min(100, product.quantity / Math.max(product.lowStockThreshold, 1) * 100)}%` }} /></span></div><span className="low-chip">Low stock</span></div>)}</div> : <EmptyState title="Looking good!" body="Nothing is running low at the moment." />}</section><section className="panel movement-panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Little things moving in and out.</p></div><button className="text-button" onClick={() => onNavigate('history')}>See all <span>→</span></button></div>{movements.slice(0, 5).length ? <div className="activity-list">{movements.slice(0, 5).map((movement) => <ActivityRow movement={movement} key={movement._id} />)}</div> : <EmptyState title="A fresh start" body="Stock changes will show up here." />}</section></div><div className="bottom-prompt"><div className="prompt-sparkle">✦</div><div><strong>Just getting started?</strong><p>Add your first products to see your inventory come to life.</p></div><button className="text-button" onClick={onAddProduct}>Add a product <span>→</span></button></div></>
}

function MetricCard({ label, value, note, icon, tone, alert }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value">{value}</div><div className={`metric-note ${alert ? 'metric-alert' : ''}`}><span className="metric-note-dot" />{note}</div></div>
}

function ProductsPage({ products, categories, search, setSearch, filter, setFilter, onAdd, onEdit, onArchive }) {
  return <><PageHeading eyebrow="YOUR CATALOG" title="Products" description="The things you make, sell, and keep track of." action={onAdd} actionLabel="Add product" /><section className="panel table-panel"><div className="table-toolbar"><div className="toolbar-search"><span>{icons.search}</span><input aria-label="Filter products" placeholder="Find a product..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><select aria-label="Filter products by category" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All products</option><option value="low">Low stock</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select><span className="result-count">{products.length} {products.length === 1 ? 'product' : 'products'}</span></div>{products.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>STOCK</th><th>UNIT PRICE</th><th>STATUS</th><th /></tr></thead><tbody>{products.map((product) => { const low = product.quantity <= product.lowStockThreshold; return <tr key={product._id}><td><div className="table-product"><ProductAvatar name={product.name} /><span><strong>{product.name}</strong><small>{[product.brand, product.packSize && product.packUnit ? `${product.packSize} ${product.packUnit}` : '', product.description].filter(Boolean).join(' · ') || '—'}</small></span></div></td><td className="sku-cell">{product.sku}</td><td><span className="category-pill">{product.category?.name || 'Uncategorized'}</span></td><td><strong>{product.quantity}</strong> <span className="muted">{product.unit || 'units'}</span></td><td>{currency.format(product.unitPrice)}</td><td><span className={`status-pill ${low ? 'status-low' : 'status-good'}`}><i />{low ? 'Low stock' : 'In stock'}</span></td><td><div className="row-actions"><button aria-label={`Edit ${product.name}`} onClick={() => onEdit(product)}>Edit</button><button aria-label={`Archive ${product.name}`} onClick={() => onArchive(product)}>···</button></div></td></tr>})}</tbody></table></div> : <EmptyState title="No products found" body={search || filter !== 'all' ? 'Try adjusting your search or filters.' : 'Add your first product to get your inventory started.'} />}</section></>
}

function CategoriesPage({ categories, products, onAdd, onDelete }) {
  return <><PageHeading eyebrow="KEEP THINGS ORGANIZED" title="Categories" description="A good home for every product in your catalog." action={onAdd} actionLabel="Add category" /><div className="category-grid">{categories.map((category, index) => { const count = products.filter((product) => product.category?._id === category._id).length; return <article className="category-card" key={category._id}><div className={`category-art category-art-${index % 4}`}><span>{['✳', '◈', '❋', '✦'][index % 4]}</span><button aria-label={`Delete ${category.name}`} onClick={() => onDelete(category)}>···</button></div><div className="category-card-info"><div><h3>{category.name}</h3><p>{category.description || 'A little corner of your catalog.'}</p></div><span className="category-count">{count} {count === 1 ? 'item' : 'items'}</span></div></article>})}<button className="category-add-card" onClick={onAdd}><span>+</span><strong>Make a new category</strong><small>Keep your catalog tidy</small></button></div>{!categories.length && <div className="panel category-empty"><EmptyState title="Start with a category" body="Categories make it easier to find your products later." /></div>}</>
}

function StockPage({ products, movements, onRecord }) {
  const todaysMovements = movements.filter((movement) => new Date(movement.createdAt).toDateString() === new Date().toDateString())
  return <><PageHeading eyebrow="MAKE A STOCK CHANGE" title="Stock entry" description="Coming in, going out, or a quick count correction." action={onRecord} actionLabel="New stock entry" /><div className="stock-intro"><div className="stock-intro-icon">⇄</div><div><h2>Every little change, accounted for.</h2><p>Record a delivery, log a sale, or adjust a count. Your product levels and movement history update together.</p></div></div><div className="stock-action-grid"><button className="stock-action-card stock-in" onClick={onRecord}><span className="action-symbol">↓</span><span className="eyebrow">GOODS ARRIVING</span><strong>Stock in</strong><small>Log a new delivery or restock.</small><span className="action-link">Record incoming stock <b>→</b></span></button><button className="stock-action-card stock-out" onClick={onRecord}><span className="action-symbol">↑</span><span className="eyebrow">GOODS LEAVING</span><strong>Stock out</strong><small>Record a sale, damaged item, or other outgoing stock.</small><span className="action-link">Record outgoing stock <b>→</b></span></button><button className="stock-action-card stock-adjust" onClick={onRecord}><span className="action-symbol">⌁</span><span className="eyebrow">COUNTING THE SHELVES</span><strong>Adjust quantity</strong><small>Correct a product's level after a stocktake.</small><span className="action-link">Make an adjustment <b>→</b></span></button></div><section className="panel stock-summary"><div className="panel-heading"><div><h3>Today's movement</h3><p>A quick pulse check for today.</p></div><span className="today-chip">{todaysMovements.length} entries</span></div><div className="stock-today-stats"><div><span>Stock in</span><strong>{todaysMovements.filter((item) => item.type === 'in').reduce((sum, item) => sum + item.quantity, 0)} <small>units</small></strong></div><div><span>Stock out</span><strong>{todaysMovements.filter((item) => item.type === 'out').reduce((sum, item) => sum + item.quantity, 0)} <small>units</small></strong></div><div><span>Products tracked</span><strong>{products.length} <small>items</small></strong></div></div></section></>
}

function HistoryPage({ movements }) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [term, setTerm] = useState('')
  const filtered = movements.filter((movement) => (typeFilter === 'all' || movement.type === typeFilter) && `${movement.product?.name || ''} ${movement.product?.sku || ''} ${movement.note || ''}`.toLowerCase().includes(term.toLowerCase()))
  return <><PageHeading eyebrow="THE PAPER TRAIL" title="Movement history" description="A clear record of everything that came in, went out, or changed." /><section className="panel table-panel"><div className="table-toolbar"><div className="toolbar-search"><span>{icons.search}</span><input placeholder="Search activity..." aria-label="Search movement history" value={term} onChange={(event) => setTerm(event.target.value)} /></div><select aria-label="Filter movements by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All movements</option><option value="in">Stock in</option><option value="out">Stock out</option><option value="adjustment">Adjustments</option></select><span className="result-count">{filtered.length} entries</span></div>{filtered.length ? <div className="history-list">{filtered.map((movement) => <ActivityRow movement={movement} key={movement._id} detailed />)}</div> : <EmptyState title="No movements yet" body="Once you record a stock change, it will show up here." />}</section></>
}

function ActivityRow({ movement, detailed = false }) {
  const type = movement.type === 'in' ? 'in' : movement.type === 'out' ? 'out' : 'adjustment'
  const label = type === 'in' ? 'Stock in' : type === 'out' ? 'Stock out' : 'Adjustment'
  return <div className={`activity-row ${detailed ? 'activity-detailed' : ''}`}><span className={`movement-icon movement-${type}`}>{type === 'in' ? '↓' : type === 'out' ? '↑' : '⌁'}</span><div className="activity-copy"><strong>{movement.product?.name || 'Product removed'}</strong><small>{label}{movement.note ? ` · ${movement.note}` : ''}</small></div><span className={`movement-quantity movement-quantity-${type}`}>{type === 'in' ? '+' : type === 'out' ? '−' : '↔'}{movement.quantity} <small>units</small></span><span className="activity-date">{new Date(movement.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} <small>{new Date(movement.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small></span></div>
}

function ProductAvatar({ name = 'Product' }) {
  const colors = ['avatar-lavender', 'avatar-yellow', 'avatar-mint', 'avatar-peach', 'avatar-blue']
  const color = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length
  return <span className={`product-avatar ${colors[color]}`}>{name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
}

function EmptyState({ title, body }) {
  return <div className="empty-state"><span>✳</span><strong>{title}</strong><p>{body}</p></div>
}

function Modal({ title, subtitle, onClose, children, onSubmit, submitLabel = 'Save changes', submitting }) {
  const [error, setError] = useState('')
  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try { await onSubmit(values) } catch (submitError) { setError(submitError.message) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="modal-card" onSubmit={handleSubmit}><div className="modal-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" className="modal-close" aria-label="Close dialog" onClick={onClose}>×</button></div>{children}{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={submitting}>{submitLabel} <span>→</span></button></div></form></div>
}

function ProductModal({ product, categories, onClose, onSave }) {
  return <Modal title={product ? 'A little product edit' : 'Add a product'} subtitle="Give this item a place in your inventory." onClose={onClose} onSubmit={onSave} submitLabel={product ? 'Save product' : 'Add product'}><div className="form-grid"><label className="form-field field-wide">Product name<input name="name" required defaultValue={product?.name || ''} placeholder="e.g. Everyday ceramic mug" /></label><label className="form-field">SKU<input name="sku" required defaultValue={product?.sku || ''} placeholder="e.g. MUG-001" /></label><label className="form-field">Category<select name="category" defaultValue={product?.category?._id || ''}><option value="">Uncategorized</option>{categories.map((category) => <option value={category._id} key={category._id}>{category.name}</option>)}</select></label><label className="form-field">Brand<input name="brand" maxLength="80" defaultValue={product?.brand || ''} placeholder="e.g. Generic" /></label><label className="form-field">Wholesale unit<input name="unit" maxLength="40" defaultValue={product?.unit || ''} placeholder="e.g. bag, tin, carton" /></label><label className="form-field">Pack size<input name="packSize" type="number" min="0.01" step="0.01" defaultValue={product?.packSize ?? ''} placeholder="e.g. 25" /></label><label className="form-field">Pack unit<input name="packUnit" maxLength="40" defaultValue={product?.packUnit || ''} placeholder="e.g. kg, litre" /></label><label className="form-field">Unit price (INR)<input name="unitPrice" type="number" min="0" step="0.01" required defaultValue={product?.unitPrice ?? ''} placeholder="0.00" /></label><label className="form-field">Unit cost (INR)<input name="unitCost" type="number" min="0" step="0.01" required defaultValue={product?.unitCost ?? ''} placeholder="0.00" /></label>{!product && <label className="form-field">Starting quantity<input name="quantity" type="number" min="0" step="1" required defaultValue="0" /></label>}<label className="form-field">Low stock alert at<input name="lowStockThreshold" type="number" min="0" step="1" required defaultValue={product?.lowStockThreshold ?? '5'} /></label><label className="form-field field-wide">Description<textarea name="description" rows="2" defaultValue={product?.description || ''} placeholder="A short note about this product…" /></label></div></Modal>
}

function CategoryModal({ onClose, onSave }) {
  return <Modal title="Make a new category" subtitle="Keep your catalog tidy and easy to browse." onClose={onClose} onSubmit={onSave} submitLabel="Create category"><div className="form-grid"><label className="form-field field-wide">Category name<input name="name" required placeholder="e.g. Home & living" /></label><label className="form-field field-wide">A little description<textarea name="description" rows="3" placeholder="What kind of products belong here?" /></label></div></Modal>
}

function MovementModal({ products, onClose, onSave }) {
  const [type, setType] = useState('in')
  return <Modal title="Record a stock change" subtitle="Every entry helps keep the count honest." onClose={onClose} onSubmit={onSave} submitLabel="Save entry"><div className="form-grid"><label className="form-field field-wide">What's changing?<select name="type" value={type} onChange={(event) => setType(event.target.value)}><option value="in">Stock in — a delivery or restock</option><option value="out">Stock out — a sale or damaged item</option><option value="adjustment">Adjustment — correct the current count</option></select></label><label className="form-field field-wide">Product<select name="product" required defaultValue=""><option value="" disabled>Select a product</option>{products.map((product) => <option value={product._id} key={product._id}>{product.name} · {product.quantity} in stock</option>)}</select></label><label className="form-field field-wide">{type === 'adjustment' ? 'New total quantity' : 'Quantity'}<input name="quantity" type="number" min="0" step="1" required placeholder={type === 'adjustment' ? 'Set the new count' : 'How many units?'} /></label><label className="form-field field-wide">Note (optional)<textarea name="note" rows="2" placeholder="A little context for later…" /></label></div></Modal>
}

function InviteModal({ onClose, onSave }) {
  return <Modal title="Invite an administrator" subtitle="We'll email them a secure link to set their password." onClose={onClose} onSubmit={onSave} submitLabel="Send invitation"><div className="form-grid"><label className="form-field field-wide">Full name<input name="name" required maxLength="80" placeholder="e.g. Alex Morgan" /></label><label className="form-field field-wide">Email address<input name="email" type="email" required placeholder="alex@yourbusiness.com" /></label></div></Modal>
}

export default App
