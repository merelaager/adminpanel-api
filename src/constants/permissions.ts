export enum Permissions {
  VIEW_SHIFT_STAFF = "staff.view.shift",
  VIEW_REGISTRATION_BASIC = "registration.view.basic",
  VIEW_REGISTRATION_FULL = "registration.view.full",
  VIEW_REGISTRATION_PERSONAL_INFO = "registration.view.personal-info",
  VIEW_REGISTRATION_PRICE = "registration.view.price",
  VIEW_REGISTRATION_CONTACT = "registration.view.contact",
  EDIT_REGISTRATION_PRICE = "registration.edit.price",
  EDIT_REGISTRATION_IS_REGISTERED = "registration.edit.isRegistered",
  DELETE_REGISTRATION = "registration.delete",
  VIEW_SHIFT_BASIC = "shift.view.basic",
  VIEW_SHIFT_PERMISSIONS = "shift.view.permissions",
  EDIT_SHIFT_BASIC = "shift.edit.basic",
  EDIT_SHIFT_MEMBERS = "shift.edit.members",
}

export enum PermissionPrefixes {
  REGISTRATION_VIEW = "registration.view",
  REGISTRATION_EDIT = "registration.edit",
}
