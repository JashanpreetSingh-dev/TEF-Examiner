export type Section = "A" | "B";

export type EO1Item = {
  id: number;
  section: "EO1";
  prompt: string;
  title: string | null;
  suggested_questions: string[];
  time_limit_sec: number;
  image: string | null;
  difficulty: string;
};

export type EO2Item = {
  id: number;
  section: "EO2";
  prompt: string;
  title: string | null;
  counter_arguments: string[];
  image: string;
  time_limit_sec: number;
  difficulty: string;
};

export type Scenario =
  | ({ sectionKey: "A" } & EO1Item)
  | ({ sectionKey: "B" } & EO2Item);

import eo1Raw from "@/data/section_a_knowledge_base.json";
import eo2Raw from "@/data/section_b_knowledge_base.json";

const eo1 = eo1Raw as EO1Item[];
const eo2 = eo2Raw as EO2Item[];

export function getRandomScenario(section: Section): Scenario {
  const arr = section === "A" ? eo1 : eo2;
  const idx = Math.floor(Math.random() * arr.length);
  const picked = arr[idx];
  return section === "A"
    ? ({ sectionKey: "A", ...picked } satisfies Scenario)
    : ({ sectionKey: "B", ...picked } satisfies Scenario);
}

export function getImageUrl(section: Section, id: number): string {
  return section === "A"
    ? `/section_a_images/section_a_image_${id}.png`
    : `/section_b_images/section_b_image_${id}.png`;
}


