import test from 'node:test'
import assert from 'node:assert/strict'
import { effectivePermissions, permissions, permissionsForRole, publicUser, rolePermissions } from '../src/middleware/authorization.js'

test('role defaults keep team administration exclusive to admins', () => {
  assert.ok(rolePermissions.admin.includes(permissions.teamManage))
  assert.ok(!rolePermissions.inventory_manager.includes(permissions.teamManage))
  assert.ok(!rolePermissions.staff.includes(permissions.productManage))
})

test('explicit permissions override non-admin defaults but cannot grant team management', () => {
  assert.deepEqual(permissionsForRole('staff', ['inventory.read']), ['inventory.read'])
  assert.throws(() => permissionsForRole('staff', [permissions.teamManage]), /cannot be assigned/)
  assert.deepEqual(effectivePermissions({ role: 'staff', permissions: [] }), [])
  assert.ok(effectivePermissions({ role: 'staff', permissions: [permissions.movementIn] }).includes(permissions.inventoryRead))
  assert.ok(effectivePermissions({ role: 'staff', permissions: [permissions.movementIn] }).includes(permissions.movementRead))
})

test('administrator permissions cannot be narrowed by a stored custom list', () => {
  assert.deepEqual(effectivePermissions({ role: 'admin', permissions: [] }), rolePermissions.admin)
})

test('public users omit password fields and expose access status and permissions', () => {
  const user = publicUser({
    id: 'user-id',
    _id: 'user-id',
    name: 'Test User',
    email: 'test@example.com',
    role: 'staff',
    permissions: ['inventory.read'],
    isActive: false,
    passwordHash: 'never expose',
  })
  assert.equal(user.isActive, false)
  assert.deepEqual(user.permissions, ['inventory.read'])
  assert.equal(Object.hasOwn(user, 'passwordHash'), false)
})
