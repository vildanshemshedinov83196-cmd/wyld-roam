const GB =
  1024 * 1024 * 1024;

export const TELEGRAM_STAR_REWARD_USD =
  0.013;

/*
 * Стандартные пакеты:
 * 3 / 5 / 10 / 20 / 50 GB
 */
const STANDARD_PROFIT_BY_GB: Record<
  number,
  number
> = {
  3: 2,
  5: 3,
  10: 9,
  20: 15,
  50: 30,
};

/*
 * Суточные пакеты:
 * 1 / 2 / 3 / 5 / 10 GB в день
 */
const DAILY_PROFIT_BY_GB: Record<
  number,
  number
> = {
  1: 1,
  2: 1.5,
  3: 2,
  5: 3,
  10: 5,
};

/*
 * Минимальная розничная лестница DAILY.
 *
 * Она не заменяет маржу, а лишь не даёт
 * более крупному пакету стоить столько же
 * или дешевле более маленького.
 */
const DAILY_MIN_RETAIL_BY_GB: Record<
  number,
  number
> = {
  1: 1.99,
  2: 3.99,
  3: 4.99,
  5: 6.99,
  10: 11.99,
};

export function bytesToGb(
  bytes: number
) {
  return bytes / GB;
}

function normalizeGb(
  volumeBytes: number
) {
  return Math.round(
    bytesToGb(volumeBytes)
  );
}

export function getTargetProfit(
  volumeBytes: number,
  dataType = 1
) {
  const gb =
    normalizeGb(volumeBytes);

  const table =
    dataType === 2
      ? DAILY_PROFIT_BY_GB
      : STANDARD_PROFIT_BY_GB;

  const profit =
    table[gb];

  if (
    typeof profit !==
    "number"
  ) {
    throw new Error(
      `Unsupported WYLD ROAM ${
        dataType === 2
          ? "daily"
          : "standard"
      } volume: ${gb} GB`
    );
  }

  return profit;
}

export function calculateRetailPrice(
  cost: number,
  volumeBytes: number,
  dataType = 1
) {
  if (
    !Number.isFinite(cost) ||
    cost <= 0
  ) {
    throw new Error(
      "Invalid supplier cost"
    );
  }

  const targetProfit =
    getTargetProfit(
      volumeBytes,
      dataType
    );

  const target =
    cost + targetProfit;

  /*
   * Округляем вверх до красивой
   * цены *.99, не уменьшая
   * целевую маржу.
   */
  const whole =
    Math.floor(target);

  const candidate =
    whole + 0.99;

  let retailPrice: number;

  if (
    candidate + 1e-9 >=
    target
  ) {
    retailPrice =
      Number(
        candidate.toFixed(2)
      );
  } else {
    retailPrice =
      Number(
        (
          whole + 1.99
        ).toFixed(2)
      );
  }

  /*
   * Для DAILY дополнительно применяем
   * минимальную ценовую лестницу.
   *
   * Если себестоимость + маржа требует
   * большей цены — используется большая.
   */
  if (dataType === 2) {
    const gb =
      normalizeGb(
        volumeBytes
      );

    const minimumRetail =
      DAILY_MIN_RETAIL_BY_GB[
        gb
      ];

    if (
      typeof minimumRetail ===
        "number" &&
      retailPrice <
        minimumRetail
    ) {
      retailPrice =
        minimumRetail;
    }
  }

  return Number(
    retailPrice.toFixed(2)
  );
}

export function usdToStars(
  amount: number
) {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid USD amount"
    );
  }

  return Math.max(
    1,
    Math.ceil(
      amount /
        TELEGRAM_STAR_REWARD_USD
    )
  );
}

export function starsToRewardUsd(
  stars: number
) {
  return (
    stars *
    TELEGRAM_STAR_REWARD_USD
  );
}

export function bytesToReadable(
  bytes: number
) {
  const gb =
    bytes / GB;

  if (gb >= 1) {
    return `${Number(
      gb.toFixed(2)
    )} GB`;
  }

  const mb =
    bytes /
    1024 /
    1024;

  return `${Math.round(
    mb
  )} MB`;
}
