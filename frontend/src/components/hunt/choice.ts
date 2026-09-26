/** A small toggle button: must/wish, an enum option. */
export const choice = (active: boolean) =>
  `px-2.5 py-1 rounded border text-xs cursor-pointer transition-colors ${
    active ? 'border-[#E4D6BE] text-[#F2F5F4]' : 'border-[#0E4A40] text-[#8FA6A1] hover:border-[#8FA6A1]'
  }`;

/** A wish without a weight of its own counts as the server's default, +2. */
export const DEFAULT_WISH_WEIGHT = 2;
