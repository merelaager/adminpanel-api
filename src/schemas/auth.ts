import { Static, Type } from "@sinclair/typebox";

export const CredentialsSchema = Type.Object({
  username: Type.String(),
  password: Type.String(),
});

export type LoginBody = Static<typeof CredentialsSchema>;

export interface Auth {
  userId: number;
}

export const PasswordSchema = Type.Object({
  password: Type.String()
})

export type ChangePasswordBody = Static<typeof PasswordSchema>
