/** How much a block must be made smaller to fit the room it has: 1 when it fits already. */
export const fitScale = (room: number, height: number): number => (height <= room || height <= 0 || room <= 0 ? 1 : Math.floor((room / height) * 1000) / 1000);
