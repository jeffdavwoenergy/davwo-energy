// Render-block contract: the ANI assistant answers with an ARRAY of these blocks
// (charts, tables, KPIs, insights) instead of markdown. The frontend renders each
// block type. Numbers always come from verified real data — when an LLM is wired in,
// it narrates/selects but never invents the figures.

export type ChartPoint = {
  label: string;
  value: number;
  lower?: number;
  upper?: number;
  color?: string;
};

export type KpiItem = {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;
  live?: boolean;
};

export type Block =
  | { type: "text"; text: string }
  | { type: "kpis"; items: KpiItem[] }
  | {
      type: "chart";
      chartType: "line" | "area" | "bar" | "pie";
      title?: string;
      unit?: string;
      data: ChartPoint[];
      band?: boolean;
    }
  | { type: "table"; title?: string; columns: string[]; rows: (string | number)[][] }
  | {
      type: "insight";
      severity: "high" | "medium" | "low" | "info";
      title: string;
      detail: string;
      recommendation?: string;
    };

export interface AssistantAnswer {
  blocks: Block[];
  capabilities: string[];
  mode: "live-llm" | "deterministic";
}
