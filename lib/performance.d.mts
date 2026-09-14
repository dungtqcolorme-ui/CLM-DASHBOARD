export type ScorePerson = {ten: string; rawTen: string; diemLamViec: number | null; soGio: number | null; hieuSuat: number | null; nangLuc: number | null; kyLuat: number | null; tieuChi: {nhom: string; noiDung: string; diem: number | null; chiTiet: string[]; block: number}[]};
export type ScoreCourse = {ten: string; weeks: {ten: string; people: ScorePerson[]}[]};
export function scoreNumber(value: unknown): number | null;
export function parseCsvGrid(text: string): string[][];
export function parseScoreGrid(grid: unknown[][]): ScoreCourse[];
export function scoreCanonicalPerson(name: string, course: string): string;
export function scoreNameKey(value: unknown): string;
