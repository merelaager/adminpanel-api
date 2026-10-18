export const formatEuros = (cents: number): string => {
  const euros = cents / 100;
  const text = Number.isInteger(euros)
    ? `${euros}`
    : euros.toFixed(2).replace(".", ",");
  return `${text} €`;
};
