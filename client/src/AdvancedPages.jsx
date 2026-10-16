import { useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'

const API_TIME_ZONE = 'Asia/Kolkata'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: API_TIME_ZONE }).format(new Date())

async function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((value) => {
    const text = String(value ?? '')
    return `"${text.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function Heading({ eyebrow, title, description, action, actionLabel, actionDisabled = false, back }) {
  return (
    <div className="page-heading">
      <div>{back && <button className="text-button page-back" onClick={back}>← Back to categories</button>}<span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action && <button className="primary-button" disabled={actionDisabled} onClick={action}>{actionLabel}</button>}
    </div>
  )
}

export function StockEntryTabs({ active, onNavigate, canIn, canOut, canViewEntry = true }) {
  return (
    <nav className="stock-entry-tabs" aria-label="Stock entry sections">
      {canViewEntry && <button className={active === 'stock' ? 'active' : ''} aria-current={active === 'stock' ? 'page' : undefined} onClick={() => onNavigate('stock')}>Stock entry</button>}
      {canIn && <button className={active === 'stock-in' ? 'active' : ''} aria-current={active === 'stock-in' ? 'page' : undefined} onClick={() => onNavigate('stock-in')}>Stock in</button>}
      {canOut && <button className={active === 'stock-out' ? 'active' : ''} aria-current={active === 'stock-out' ? 'page' : undefined} onClick={() => onNavigate('stock-out')}>Stock out</button>}
    </nav>
  )
}

function Empty({ children }) {
  return <div className="advanced-empty">{children}</div>
}

function ProductSymbol({ name = '?' }) {
  return <span className="advanced-product-symbol">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
}

function Pager({ page, pagination, setPage }) {
  if (!pagination || pagination.totalPages < 2) return null
  return <div className="advanced-pager"><span>{pagination.totalItems} results · Page {page} of {pagination.totalPages}</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next</button></div></div>
}

export function CategoryDetailPage({ categoryId, token, request, onBack, onRecord, canIn, canOut }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('name-asc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ page: String(page), limit: '20', search, status, sort })
    request(`/categories/${categoryId}/products?${params}`, { token })
      .then((result) => { if (!cancelled) setData(result) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [categoryId, page, search, status, sort, token, request])

  function update(setter, value) {
    setter(value)
    setPage(1)
    setLoading(true)
    setError('')
  }

  return (
    <>
      <Heading eyebrow="CATEGORY INVENTORY" title={data?.category?.name || 'Category details'} description={data?.category?.description || 'Products and live stock levels assigned to this category.'} back={onBack} />
      {data && <div className="report-cards category-detail-stats">
        <section className="panel report-card"><span className="eyebrow">ACTIVE PRODUCTS</span><strong>{data.summary.totalProducts}</strong><p>Products in this category.</p></section>
        <section className="panel report-card"><span className="eyebrow">UNITS ON HAND</span><strong>{data.summary.totalUnits}</strong><p>Current units across these products.</p></section>
        <section className="panel report-card"><span className="eyebrow">LOW STOCK</span><strong>{data.summary.lowStockCount}</strong><p>At or below their configured threshold.</p></section>
        <section className="panel report-card"><span className="eyebrow">INVENTORY COST</span><strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.summary.inventoryValue)}</strong><p>Current on-hand value at unit cost.</p></section>
      </div>}
      <section className="panel table-panel">
        <div className="table-toolbar advanced-toolbar">
          <label className="toolbar-search"><span>⌕</span><input aria-label="Search category products" placeholder="Search product name or SKU" value={search} onChange={(event) => update(setSearch, event.target.value)} /></label>
          <select aria-label="Filter category products" value={status} onChange={(event) => update(setStatus, event.target.value)}><option value="all">All stock statuses</option><option value="low">Low stock</option><option value="in-stock">In stock</option><option value="out-of-stock">Out of stock</option></select>
          <select aria-label="Sort category products" value={sort} onChange={(event) => update(setSort, event.target.value)}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="quantity-asc">Stock: lowest</option><option value="quantity-desc">Stock: highest</option><option value="last-movement-desc">Latest movement</option></select>
        </div>
        {error && <p className="advanced-error" role="alert">{error}</p>}
        {loading ? <Empty>Loading category inventory…</Empty> : data?.products.length ? <>
          <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>BRAND / PACK</th><th>ON HAND</th><th>LAST MOVEMENT</th><th>STOCK ACTIONS</th></tr></thead>
            <tbody>{data.products.map((product) => <tr key={product._id}>
              <td><div className="table-product"><ProductSymbol name={product.name} /><span><strong>{product.name}</strong><small>{product.unit || 'units'}</small></span></div></td>
              <td>{product.sku}</td><td>{[product.brand, product.packSize && `${product.packSize} ${product.packUnit}`].filter(Boolean).join(' · ') || '—'}</td>
              <td><strong>{product.quantity}</strong> {product.unit || 'units'}{product.quantity <= product.lowStockThreshold && <span className="advanced-low-label">Low</span>}</td>
              <td>{product.lastMovement ? `${product.lastMovement.type} · ${new Date(product.lastMovement.createdAt).toLocaleDateString()}` : 'No movement recorded'}</td>
              <td><div className="advanced-row-actions">{canIn && <button onClick={() => onRecord('in', product._id)}>Stock in</button>}{canOut && <button onClick={() => onRecord('out', product._id)}>Stock out</button>}{!canIn && !canOut && 'View only'}</div></td>
            </tr>)}</tbody>
          </table></div>
          <Pager page={page} pagination={data.pagination} setPage={setPage} />
        </> : <Empty>{error ? 'Category inventory could not be loaded.' : 'No products match this category and filter.'}</Empty>}
      </section>
    </>
  )
}

export function StockFlowPage({ type, products, token, request, onRecord, onNavigate, canViewHistory, canViewEntry, canIn, canOut }) {
  const [date, setDate] = useState(today)
  const [summary, setSummary] = useState(null)
  const [latestMovements, setLatestMovements] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const isInbound = type === 'in'
  const movementType = isInbound ? 'in' : 'out'
  const latestByProduct = useMemo(() => new Map(
    latestMovements.map((movement) => [movement.productId, movement]),
  ), [latestMovements])

  useEffect(() => {
    let cancelled = false
    request('/movements/latest-by-product', { token })
      .then((result) => { if (!cancelled) setLatestMovements(result.latestMovements) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message) })
    return () => { cancelled = true }
  }, [request, token])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ type: movementType, from: date, to: date })
    request(`/movements/summary?${params}`, { token })
      .then((result) => { if (!cancelled) setSummary(result) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [date, movementType, request, token])

  const visibleProducts = products.filter((product) => `${product.name} ${product.sku} ${product.category?.name || ''}`.toLowerCase().includes(search.toLowerCase()))
  const title = isInbound ? 'Stock in' : 'Stock out'
  const todayLabel = date === today() ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })
  return (
    <>
      <StockEntryTabs active={isInbound ? 'stock-in' : 'stock-out'} onNavigate={onNavigate} canIn={canIn} canOut={canOut} canViewEntry={canViewEntry} />
      <Heading eyebrow={isInbound ? 'INCOMING GOODS' : 'OUTGOING GOODS'} title={title} description={isInbound ? 'Record supplier deliveries, purchase references, and incoming quantities.' : 'Record dispatched goods, damage, internal use, and outgoing quantities.'} action={() => onRecord(movementType)} actionLabel={`Record stock ${movementType}`} />
      <section className="stock-intro stock-flow-intro"><div className="stock-intro-icon">{isInbound ? '↓' : '↑'}</div><div><h2>{isInbound ? 'Keep deliveries traceable.' : 'Keep dispatches accurate.'}</h2><p>Each entry updates on-hand stock and creates an immutable movement record. Historical totals are shown in the selected business date.</p></div><label className="advanced-date-field">Business date<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setLoading(true); setError('') }} /></label></section>
      <div className="report-cards stock-flow-stats">
        <section className="panel report-card"><span className="eyebrow">{todayLabel.toUpperCase()} {isInbound ? 'RECEIPTS' : 'DISPATCHES'}</span><strong>{summary?.summary.transactionCount ?? (loading ? '—' : 0)}</strong><p>Recorded transactions.</p></section>
        <section className="panel report-card"><span className="eyebrow">UNITS {isInbound ? 'RECEIVED' : 'DISPATCHED'}</span><strong>{summary?.summary.totalUnits ?? (loading ? '—' : 0)}</strong><p>Movement quantity for this date.</p></section>
        <section className="panel report-card"><span className="eyebrow">PRODUCTS AFFECTED</span><strong>{summary?.summary.productsAffected ?? (loading ? '—' : 0)}</strong><p>Distinct products with a recorded movement.</p></section>
      </div>
      <section className="panel table-panel">
        <div className="panel-heading advanced-list-heading"><div><h3>Active products</h3><p>Current on-hand quantity and each product’s latest known movement.</p></div>{canViewHistory && <button className="text-button" onClick={() => onNavigate('history')}>Full history →</button>}</div>
        <div className="table-toolbar"><label className="toolbar-search"><span>⌕</span><input placeholder="Search name, SKU, or category" aria-label="Search active products" value={search} onChange={(event) => setSearch(event.target.value)} /></label><span className="result-count">{visibleProducts.length} active products</span></div>
        {error && <p className="advanced-error" role="alert">{error}</p>}
        {visibleProducts.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>ON HAND</th><th>LAST MOVEMENT</th><th>{isInbound ? 'RECEIVE' : 'DISPATCH'}</th></tr></thead>
          <tbody>{visibleProducts.map((product) => {
            const lastMovement = latestByProduct.get(product._id)
            return <tr key={product._id}><td><div className="table-product"><ProductSymbol name={product.name} /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td><td>{product.category?.name || 'Uncategorized'}</td><td><strong>{product.quantity}</strong> {product.unit || 'units'}{product.quantity <= product.lowStockThreshold && <span className="advanced-low-label">Low stock</span>}</td><td>{lastMovement ? <>{lastMovement.type} · {new Date(lastMovement.createdAt).toLocaleDateString()} · {lastMovement.quantity} {product.unit || 'units'}</> : 'No movement recorded'}</td><td><button className={`secondary-button ${isInbound ? 'flow-in-button' : 'flow-out-button'}`} onClick={() => onRecord(movementType, product._id)}>{isInbound ? 'Receive stock' : 'Record dispatch'}</button></td></tr>
          })}</tbody></table></div> : <Empty>No active products match this search.</Empty>}
      </section>
      {loading && <p className="report-footnote">Loading selected-date movement totals…</p>}
    </>
  )
}

export function MovementHistoryPage({ token, request, categories, products }) {
  const [filters, setFilters] = useState({ search: '', type: 'all', product: '', category: '', from: '', to: '', sort: 'newest' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ movements: [], pagination: { totalItems: 0, totalPages: 0 } })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (filters.type !== 'all') params.set('type', filters.type)
  if (filters.product) params.set('product', filters.product)
  if (filters.category) params.set('category', filters.category)
  if (filters.search.trim()) params.set('search', filters.search.trim())
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.sort === 'oldest') params.set('sort', filters.sort)
  const query = params.toString()

  useEffect(() => {
    let cancelled = false
    request(`/movements?${query}`, { token })
      .then((result) => { if (!cancelled) setData(result) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, token, request])

  const filtered = data.movements.filter((movement) => !filters.search || `${movement.product?.name || ''} ${movement.product?.sku || ''} ${movement.note || ''} ${movement.reference || ''} ${movement.createdBy?.name || ''}`.toLowerCase().includes(filters.search.trim().toLowerCase()))
  function update(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
    setPage(1)
    setLoading(true)
    setError('')
  }
  function reset() {
    setFilters({ search: '', type: 'all', product: '', category: '', from: '', to: '', sort: 'newest' })
    setPage(1)
    setLoading(true)
    setError('')
  }

  return (
    <>
      <Heading eyebrow="INVENTORY AUDIT TRAIL" title="Movement history" description="Search and filter auditable stock-in, stock-out, and adjustment entries." />
      <section className="panel table-panel">
        <div className="table-toolbar advanced-history-toolbar">
          <label className="toolbar-search"><span>⌕</span><input placeholder="Search product, SKU, note, or user" aria-label="Search movement history" value={filters.search} onChange={(event) => update('search', event.target.value)} /></label>
          <select value={filters.type} aria-label="Filter by movement type" onChange={(event) => update('type', event.target.value)}><option value="all">All movement types</option><option value="in">Stock in</option><option value="out">Stock out</option><option value="adjustment">Adjustment</option></select>
          <select value={filters.category} aria-label="Filter by category" onChange={(event) => update('category', event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select>
          <select value={filters.product} aria-label="Filter by product" onChange={(event) => update('product', event.target.value)}><option value="">All products</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}</select>
          <label className="date-filter">From<input type="date" value={filters.from} onChange={(event) => update('from', event.target.value)} /></label>
          <label className="date-filter">To<input type="date" value={filters.to} onChange={(event) => update('to', event.target.value)} /></label>
          <select value={filters.sort} aria-label="Sort movement history" onChange={(event) => update('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
          <button className="text-button" onClick={reset}>Clear</button>
        </div>
        {error && <p className="advanced-error" role="alert">{error}</p>}
        {loading ? <Empty>Loading movement history…</Empty> : filtered.length ? <div className="history-list">{filtered.map((movement) => <div className="activity-row activity-detailed" key={movement._id}>
          <span className={`movement-icon movement-${movement.type}`}>{movement.type === 'in' ? '↓' : movement.type === 'out' ? '↑' : '↔'}</span>
          <div className="activity-copy"><strong>{movement.product?.name || 'Product removed'}</strong><small>{movement.product?.sku || ''} · {movement.type === 'in' ? 'Stock in' : movement.type === 'out' ? 'Stock out' : 'Adjustment'}{movement.product?.category?.name ? ` · ${movement.product.category.name}` : ''}</small><small>Stock: {movement.previousStock} → {movement.newStock} {movement.product?.unit || 'units'}{movement.reference ? ` · Ref: ${movement.reference}` : ''}{movement.note ? ` · ${movement.note}` : ''}{movement.createdBy?.name ? ` · by ${movement.createdBy.name}` : ''}</small></div>
          <strong className={`movement-quantity movement-quantity-${movement.type}`}>{movement.type === 'in' ? '+' : movement.type === 'out' ? '−' : '↔'}{movement.quantity}<small> units</small></strong>
          <span className="activity-date">{new Date(movement.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}<small>{new Date(movement.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small></span>
        </div>)}</div> : <Empty>No stock movements match your filters.</Empty>}
        {!loading && <Pager page={page} pagination={data.pagination} setPage={setPage} />}
      </section>
    </>
  )
}

function ChartCanvas({ report, mode }) {
  const trendCanvas = useRef(null)
  const typeCanvas = useRef(null)
  const categoryCanvas = useRef(null)
  useEffect(() => {
    if (!report || !trendCanvas.current || !typeCanvas.current || !categoryCanvas.current) return undefined
    const categories = report.inventory.categoryBreakdown
    const trend = new Chart(trendCanvas.current, {
      type: 'bar',
      data: {
        labels: report.trend.map((item) => mode === 'daily' ? item.date.slice(11, 16) || item.date : new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        datasets: [
          { label: 'Stock in', data: report.trend.map((item) => item.inUnits), backgroundColor: '#16a34a', borderRadius: 4 },
          { label: 'Stock out', data: report.trend.map((item) => item.outUnits), backgroundColor: '#ef4444', borderRadius: 4 },
          { label: 'Adjustment', data: report.trend.map((item) => item.adjustmentUnits), backgroundColor: '#6366f1', borderRadius: 4 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } } },
    })
    const typeChart = new Chart(typeCanvas.current, {
      type: 'doughnut',
      data: { labels: ['Stock in', 'Stock out', 'Adjustments'], datasets: [{ data: [report.byType.in.transactions, report.byType.out.transactions, report.byType.adjustment.transactions], backgroundColor: ['#16a34a', '#ef4444', '#6366f1'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '62%' },
    })
    const categoryChart = new Chart(categoryCanvas.current, {
      type: 'doughnut',
      data: { labels: categories.map((item) => item.name), datasets: [{ data: categories.map((item) => item.totalUnits), backgroundColor: ['#6366f1', '#16a34a', '#f59e0b', '#0ea5e9', '#e11d48', '#14b8a6', '#8b5cf6'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '58%' },
    })
    return () => { trend.destroy(); typeChart.destroy(); categoryChart.destroy() }
  }, [report, mode])

  return <div className="report-chart-grid"><section className="panel report-panel"><div className="panel-heading"><div><h3>{mode === 'daily' ? 'Movements by hour' : 'Daily movement quantities'}</h3><p>Recorded units, not sales or historical stock balances.</p></div></div><div className="chart-frame"><canvas ref={trendCanvas} /></div></section><section className="panel report-panel"><div className="panel-heading"><div><h3>Transactions by type</h3><p>Count of transactions in this period.</p></div></div><div className="chart-frame chart-frame-small"><canvas ref={typeCanvas} /></div></section><section className="panel report-panel"><div className="panel-heading"><div><h3>Current units by category</h3><p>Live inventory snapshot, not a historic category balance.</p></div></div><div className="chart-frame chart-frame-small"><canvas ref={categoryCanvas} /></div></section></div>
}

export function ReportsDashboard({ token, request, summary }) {
  const [mode, setMode] = useState('daily')
  const [date, setDate] = useState(today)
  const [month, setMonth] = useState(today().slice(0, 7))
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const query = mode === 'daily' ? `daily?date=${encodeURIComponent(date)}` : `monthly?month=${Number(month.split('-')[1])}&year=${Number(month.split('-')[0])}`
  useEffect(() => {
    let cancelled = false
    request(`/dashboard/${query}`, { token })
      .then((data) => { if (!cancelled) setReport(data) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, request, token])

  async function exportReport() {
    if (!report) return
    const rows = [
      ['Period', mode === 'daily' ? date : month],
      ['Business timezone', report.timeZone],
      ['Metric', 'Transactions', 'Units'],
      ['Stock in', report.byType.in.transactions, report.byType.in.units],
      ['Stock out', report.byType.out.transactions, report.byType.out.units],
      ['Adjustments', report.byType.adjustment.transactions, report.byType.adjustment.units],
      [],
      ['Date', 'Stock-in transactions', 'Stock-in units', 'Stock-out transactions', 'Stock-out units', 'Adjustment transactions', 'Adjustment units'],
      ...report.trend.map((item) => [item.date, item.in, item.inUnits, item.out, item.outUnits, item.adjustment, item.adjustmentUnits]),
    ]
    await downloadCsv(`stockroom-${mode}-${mode === 'daily' ? date : month}.csv`, rows)
  }

  return (
    <>
      <Heading eyebrow="INVENTORY INSIGHTS" title="Daily & monthly reports" description="Analyze recorded stock movements alongside a clearly labeled live inventory snapshot." action={exportReport} actionLabel="Export CSV" actionDisabled={loading || !report} />
      <div className="report-filter-bar"><div className="report-mode-tabs" role="tablist" aria-label="Report period"><button aria-selected={mode === 'daily'} className={mode === 'daily' ? 'active' : ''} onClick={() => { setMode('daily'); setLoading(true); setError('') }}>Daily</button><button aria-selected={mode === 'monthly'} className={mode === 'monthly' ? 'active' : ''} onClick={() => { setMode('monthly'); setLoading(true); setError('') }}>Monthly</button></div>{mode === 'daily' ? <label className="advanced-date-field">Business date<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setLoading(true); setError('') }} /></label> : <label className="advanced-date-field">Report month<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setLoading(true); setError('') }} /></label>}<span className="report-timezone">Timezone: {report?.timeZone || API_TIME_ZONE}</span></div>
      {error && <p className="advanced-error" role="alert">{error}</p>}
      {report && <>
        <div className="report-cards advanced-report-cards">
          <section className="panel report-card"><span className="eyebrow">TRANSACTIONS</span><strong>{report.summary.transactions}</strong><p>Stock changes recorded in this period.</p></section>
          <section className="panel report-card"><span className="eyebrow">UNITS MOVED</span><strong>{report.summary.units}</strong><p>Sum of movement quantities; adjustments use absolute difference.</p></section>
          <section className="panel report-card"><span className="eyebrow">PRODUCTS AFFECTED</span><strong>{report.summary.productsAffected}</strong><p>Distinct products with movement records.</p></section>
          <section className="panel report-card"><span className="eyebrow">CURRENT LOW STOCK</span><strong>{report.inventory.lowStockCount ?? summary?.lowStockCount ?? 0}</strong><p>Live snapshot at report viewing time.</p></section>
        </div>
        <ChartCanvas report={report} mode={mode} />
        <div className="report-grid advanced-report-lists"><section className="panel report-panel"><div className="panel-heading"><div><h3>Most moved products</h3><p>Products with the highest total movement quantity in the period.</p></div></div>{report.topProducts.length ? <div className="advanced-simple-list">{report.topProducts.map((item) => <div key={item.product._id}><ProductSymbol name={item.product.name} /><span><strong>{item.product.name}</strong><small>{item.product.sku} · {item.transactions} transactions</small></span><b>{item.units} {item.product.unit || 'units'}</b></div>)}</div> : <Empty>No product movements in this period.</Empty>}</section>
          <section className="panel report-panel"><div className="panel-heading"><div><h3>Current low-stock products</h3><p>Live inventory thresholds; not reconstructed historical levels.</p></div></div>{report.inventory.lowStockItems.length ? <div className="advanced-simple-list">{report.inventory.lowStockItems.slice(0, 8).map((product) => <div key={product._id}><ProductSymbol name={product.name} /><span><strong>{product.name}</strong><small>{product.sku} · {product.category?.name || 'Uncategorized'}</small></span><b>{product.quantity} / {product.lowStockThreshold}</b></div>)}</div> : <Empty>No products are currently below their threshold.</Empty>}</section></div>
        <p className="report-footnote">{report.note} The current stock is not a historical inventory balance and movement totals are not sales totals.</p>
      </>}
      {loading && <p className="report-footnote">Loading report…</p>}
    </>
  )
}

const editablePermissions = [
  ['inventory.read', 'View inventory'],
  ['dashboard.read', 'View dashboard'],
  ['products.manage', 'Manage products'],
  ['categories.manage', 'Manage categories'],
  ['movements.read', 'View movement history'],
  ['movements.in', 'Record stock in'],
  ['movements.out', 'Record stock out'],
  ['movements.adjust', 'Adjust stock'],
  ['reports.read', 'View reports'],
]

const defaultPermissions = {
  staff: ['inventory.read', 'dashboard.read', 'movements.read'],
  inventory_manager: ['inventory.read', 'dashboard.read', 'products.manage', 'categories.manage', 'movements.read', 'movements.in', 'movements.out', 'movements.adjust', 'reports.read'],
  admin: [],
}

export function TeamManagementPage({ team, onInvite, onUpdate, onResend, onRevoke, currentUserId }) {
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [form, setForm] = useState(null)
  const users = team?.users || []
  const invitations = team?.invitations || []
  async function run(id, callback) {
    setBusyId(id)
    setError('')
    try { await callback() } catch (requestError) { setError(requestError.message) } finally { setBusyId('') }
  }
  async function updatePermissions(user, permission, checked) {
    const next = new Set(user.permissions || [])
    if (checked) next.add(permission)
    else next.delete(permission)
    await run(user._id, () => onUpdate(user._id, { permissions: [...next] }))
  }
  return (
    <>
      <Heading eyebrow="WORKSPACE ACCESS" title="Team & permissions" description="Invite colleagues, assign least-privilege roles, and deactivate accounts without deleting their history." action={() => setForm({ name: '', email: '', role: 'staff', message: '', permissions: defaultPermissions.staff })} actionLabel="Invite team member" />
      {error && <p className="advanced-error" role="alert">{error}</p>}
      <section className="panel table-panel team-panel"><div className="panel-heading advanced-list-heading"><div><h3>Team members</h3><p>{users.length} account{users.length === 1 ? '' : 's'} · inactive users are blocked on their next request.</p></div></div>
        {users.length ? <div className="team-list">{users.map((user) => <article className="team-member" key={user._id}><div className="team-member-main"><span className="profile-avatar">{user.name?.slice(0, 1).toUpperCase()}</span><div className="activity-copy"><strong>{user.name}{user._id === currentUserId ? ' (you)' : ''}</strong><small>{user.email} · Last sign-in: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</small></div><span className={`team-status ${user.isActive ? 'team-active' : 'team-inactive'}`}>{user.isActive ? 'Active' : 'Inactive'}</span><select aria-label={`Role for ${user.name}`} value={user.role} disabled={busyId === user._id || user._id === currentUserId} onChange={(event) => run(user._id, () => onUpdate(user._id, { role: event.target.value }))}><option value="admin">Administrator</option><option value="inventory_manager">Inventory manager</option><option value="staff">Staff</option></select><button className="secondary-button" disabled={busyId === user._id || user._id === currentUserId || user.role === 'admin'} onClick={() => run(user._id, () => onUpdate(user._id, { isActive: !user.isActive }))}>{user.isActive ? 'Deactivate' : 'Reactivate'}</button></div>
          <details className="team-permissions"><summary>Permissions ({user.role === 'admin' ? 'all administrator permissions' : (user.permissions || []).length})</summary><div>{editablePermissions.map(([permission, label]) => <label key={permission}><input type="checkbox" checked={user.permissions?.includes(permission) || false} disabled={user.role === 'admin' || busyId === user._id} onChange={(event) => updatePermissions(user, permission, event.target.checked)} />{label}</label>)}</div></details>
        </article>)}</div> : <Empty>No team members found.</Empty>}
      </section>
      <section className="panel table-panel invitations-panel"><div className="panel-heading advanced-list-heading"><div><h3>Invitation history</h3><p>Invitation links expire after 24 hours; revoking an invitation prevents acceptance immediately.</p></div></div>
        {invitations.length ? <div className="team-list">{invitations.map((invitation) => <article className="team-member invitation-row" key={invitation._id}><div className="team-member-main"><span className="profile-avatar">{invitation.name?.slice(0, 1).toUpperCase()}</span><div className="activity-copy"><strong>{invitation.name} · {invitation.email}</strong><small>{invitation.role.replace('_', ' ')} · Invited {new Date(invitation.createdAt).toLocaleDateString()} · Expires {new Date(invitation.expiresAt).toLocaleString()}</small></div><span className={`team-status team-${invitation.status}`}>{invitation.status}</span>{invitation.canResend && <><button className="secondary-button" disabled={busyId === invitation._id} onClick={() => run(invitation._id, () => onResend(invitation._id))}>Resend</button>{invitation.status === 'pending' && <button className="secondary-button danger-button" disabled={busyId === invitation._id} onClick={() => run(invitation._id, () => onRevoke(invitation._id))}>Revoke</button>}</>}</div></article>)}</div> : <Empty>No invitations have been sent.</Empty>}
      </section>
      {form && <form className="advanced-modal-backdrop" onSubmit={async (event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const payload = { name: data.get('name'), email: data.get('email'), role: data.get('role'), message: data.get('message'), permissions: form.permissions }
        await run('invite', async () => { await onInvite(payload); setForm(null) })
      }}><div className="advanced-modal"><h2>Invite a team member</h2><label>Name<input name="name" required maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Email<input name="email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Role<select name="role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value, permissions: defaultPermissions[event.target.value] })}><option value="staff">Staff</option><option value="inventory_manager">Inventory manager</option><option value="admin">Administrator</option></select></label>{form.role !== 'admin' && <fieldset><legend>Permissions</legend>{editablePermissions.map(([permission, label]) => <label key={permission}><input type="checkbox" checked={form.permissions.includes(permission)} onChange={(event) => setForm({ ...form, permissions: event.target.checked ? [...form.permissions, permission] : form.permissions.filter((item) => item !== permission) })} />{label}</label>)}</fieldset>}<label>Invitation note (optional)<textarea name="message" rows="3" maxLength="240" /></label><div className="advanced-modal-actions"><button className="secondary-button" type="button" onClick={() => setForm(null)}>Cancel</button><button className="primary-button" disabled={busyId === 'invite'}>Send invitation</button></div></div></form>}
    </>
  )
}
