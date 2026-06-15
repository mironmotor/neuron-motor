// Minimal report shape mirrored from @astro/core (web stays standalone).
export interface ReportSection {
  key: string;
  title: string;
  body: string;
}

export interface ReportJson {
  title: string;
  subtitle: string;
  sections: ReportSection[];
  seven_day_plan: string[];
  upsell: string;
}

export interface ReportRow {
  id: string;
  report_json: ReportJson | null;
  full_text: string | null;
  status: string;
}
