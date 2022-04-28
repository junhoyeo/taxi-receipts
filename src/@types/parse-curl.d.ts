declare module 'parse-curl' {
  export default function parseCurl(raw: string): {
    method: string;
    header: Record<string, string>;
  };
}
