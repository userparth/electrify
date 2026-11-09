// Mirror of GPIO / RPI_BCM in packages/parts/src/parts/rpi.tsx; replace with an import once @eb/parts exports them.
export const GPIO = { COUNT: 28, IN: 0, MODE: 28, OUT: 56, PULL: 84, DUTY: 112, FREQ: 140, WAKE: 168, SIZE: 176 } as const;

export const BOARD_TO_BCM: [number, number][] = [
  [3, 2], [5, 3], [7, 4], [8, 14], [10, 15], [11, 17], [12, 18], [13, 27], [15, 22], [16, 23], [18, 24], [19, 10], [21, 9], [22, 25],
  [23, 11], [24, 8], [26, 7], [27, 0], [28, 1], [29, 5], [31, 6], [32, 12], [33, 13], [35, 19], [36, 16], [37, 26], [38, 20], [40, 21],
];
