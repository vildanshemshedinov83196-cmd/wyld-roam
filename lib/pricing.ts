export function calculateRetailPrice(cost: number) {
  let price: number;

  if (cost <= 0.4) {
    return 0.99;
  }

  if (cost <= 1) {
    return 1.99;
  }

  if (cost <= 2) {
    price = cost * 2.5;
  } else if (cost <= 5) {
    price = cost * 2.1;
  } else if (cost <= 10) {
    price = cost * 1.8;
  } else if (cost <= 20) {
    price = cost * 1.7;
  } else {
    price = cost * 1.45;
  }

  return Math.floor(price) + 0.99;
}

export function bytesToReadable(bytes: number) {
  const gb = bytes / 1024 / 1024 / 1024;

  if (gb >= 1) {
    return `${Number(gb.toFixed(2))} GB`;
  }

  const mb = bytes / 1024 / 1024;
  return `${Math.round(mb)} MB`;
}
