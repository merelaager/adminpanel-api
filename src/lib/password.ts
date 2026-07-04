export const validatePasswordPolicy = (password: string): string | null => {
  if (password.length < 8) return "Salasõna on liiga lühike.";
  return null;
};
