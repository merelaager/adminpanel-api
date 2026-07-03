export enum Permissions {
  CREATE_STAFF_MEMBER = "staff.create",
  VIEW_SHIFT_STAFF = "staff.view.shift",
  VIEW_REGISTRATION_FULL = "registration.view.full",
  VIEW_REGISTRATION_PERSONAL_INFO = "registration.view.personal-info",
  VIEW_REGISTRATION_PRICE = "registration.view.price",
  VIEW_REGISTRATION_CONTACT = "registration.view.contact",
  EDIT_REGISTRATION_PRICE = "registration.edit.price",
  EDIT_REGISTRATION_IS_REGISTERED = "registration.edit.isRegistered",
}

export enum PermissionPrefixes {
  REGISTRATION_VIEW = "registration.view",
  REGISTRATION_EDIT = "registration.edit",
}
