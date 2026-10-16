export const permissions = Object.freeze({
  inventoryRead: 'inventory.read',
  dashboardRead: 'dashboard.read',
  reportsRead: 'reports.read',
  productManage: 'products.manage',
  categoryManage: 'categories.manage',
  movementRead: 'movements.read',
  movementIn: 'movements.in',
  movementOut: 'movements.out',
  movementAdjust: 'movements.adjust',
  teamRead: 'team.read',
  teamManage: 'team.manage',
})

export const rolePermissions = Object.freeze({
  admin: Object.values(permissions),
  inventory_manager: [
    permissions.inventoryRead,
    permissions.dashboardRead,
    permissions.productManage,
    permissions.categoryManage,
    permissions.movementRead,
    permissions.movementIn,
    permissions.movementOut,
    permissions.movementAdjust,
    permissions.reportsRead,
  ],
  staff: [permissions.inventoryRead, permissions.dashboardRead, permissions.movementRead],
})

export const assignablePermissions = new Set(Object.values(permissions).filter((permission) => permission !== permissions.teamManage && permission !== permissions.teamRead))

export function effectivePermissions(user) {
  if (user?.role === 'admin') return rolePermissions.admin
  const grants = Array.isArray(user?.permissions) ? user.permissions : rolePermissions[user?.role] || []
  const effective = new Set(grants)
  const canChangeStock = [permissions.movementIn, permissions.movementOut, permissions.movementAdjust].some((permission) => effective.has(permission))
  if (effective.has(permissions.productManage) || effective.has(permissions.categoryManage) || canChangeStock) {
    effective.add(permissions.inventoryRead)
  }
  if (canChangeStock) effective.add(permissions.movementRead)
  return [...effective]
}

export function requirePermission(permission) {
  return (request, response, next) => {
    if (!effectivePermissions(request.user).includes(permission)) {
      return response.status(403).json({ message: 'You do not have permission to perform this action.' })
    }
    next()
  }
}

export function isAllowedRole(value) {
  return Object.hasOwn(rolePermissions, value)
}

export function permissionsForRole(role, suppliedPermissions) {
  if (role === 'admin') return rolePermissions.admin
  if (suppliedPermissions === undefined) return rolePermissions[role] || []
  if (!Array.isArray(suppliedPermissions)) throw new TypeError('Permissions must be an array.')
  if (suppliedPermissions.some((permission) => typeof permission !== 'string' || !assignablePermissions.has(permission))) {
    throw new RangeError('One or more permissions cannot be assigned.')
  }
  return [...new Set(suppliedPermissions)]
}

export function publicUser(user) {
  return {
    id: user.id,
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: effectivePermissions(user),
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
  }
}
