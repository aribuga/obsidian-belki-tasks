import { normalizePath } from "obsidian";
import { addDaysIso, todayIso, yesterdayIso } from "./dateUtils";
import { BelkiTask, Priority } from "./types";

export const DEMO_PROJECTS = [
  "Inbox",
  "Client Work",
  "Portfolio",
  "Motion Reel",
  "Studio Admin",
  "Personal",
  "Home",
  "Health",
  "Research"
];

export const DEMO_LABELS = [
  "urgent",
  "client",
  "visual",
  "admin",
  "writing",
  "research",
  "errand",
  "home",
  "health",
  "idea",
  "review"
];

export const DEMO_MAIN_CONTENT = [
  "# belki demo data",
  "",
  "This folder contains demo task data for the belki Obsidian plugin.",
  "",
  "Task data lives in `Data/YYYY-MM.md`.",
  "Attachments live in `Attachments/task-id/`."
].join("\n");

export interface DemoAttachmentFile {
  path: string;
  content: string;
}

export interface DemoSeedData {
  tasks: BelkiTask[];
  attachments: DemoAttachmentFile[];
}

interface DemoTaskSpec {
  id: string;
  title: string;
  project: string;
  priority: Priority;
  description?: string;
  due?: string;
  deadline?: string;
  labels?: string[];
  attachments?: string[];
  completed?: boolean;
  completedDate?: string;
}

export function buildDemoSeedData(sourcePath: string, attachmentsDir: string): DemoSeedData {
  const dates = {
    yesterday: yesterdayIso(),
    today: todayIso(),
    tomorrow: addDaysIso(1),
    plus2: addDaysIso(2),
    plus3: addDaysIso(3),
    plus7: addDaysIso(7),
    plus14: addDaysIso(14)
  };

  const attachmentPaths = {
    moodboard: attachmentPath(attachmentsDir, "task-demo-hero", "moodboard.svg"),
    logoOptions: attachmentPath(attachmentsDir, "task-demo-logo", "logo-options.svg"),
    logoGrid: attachmentPath(attachmentsDir, "task-demo-logo", "logo-grid.svg"),
    caseStudy: attachmentPath(
      attachmentsDir,
      "task-demo-portfolio",
      "case-study-notes.txt"
    ),
    reelFrame: attachmentPath(attachmentsDir, "task-demo-reel", "reel-frame.svg")
  };

  const specs: DemoTaskSpec[] = [
    {
      id: "task-demo-hero",
      title: "Finalize homepage hero layout",
      project: "Client Work",
      priority: "P1",
      due: dates.today,
      deadline: dates.plus2,
      description:
        "Polish the typography, spacing, and image crop before sending the first preview to the client.",
      labels: ["client", "visual", "urgent"],
      attachments: [attachmentPaths.moodboard]
    },
    {
      id: "task-demo-logo",
      title: "Export three logo lockups",
      project: "Client Work",
      priority: "P2",
      due: dates.today,
      description:
        "Export horizontal, stacked, and icon-only versions as SVG and PNG.",
      labels: ["client", "visual"],
      attachments: [attachmentPaths.logoOptions, attachmentPaths.logoGrid]
    },
    {
      id: "task-demo-portfolio",
      title: "Write portfolio case study draft",
      project: "Portfolio",
      priority: "P2",
      due: dates.today,
      deadline: dates.plus7,
      description:
        "Write the story behind the interactive poster project. Keep it short and visual.",
      labels: ["writing", "visual"],
      attachments: [attachmentPaths.caseStudy]
    },
    {
      id: "task-demo-motion-references",
      title: "Collect references for motion reel opener",
      project: "Motion Reel",
      priority: "P3",
      due: dates.today,
      description:
        "Find pacing, typography, and transition references for a 20-second opening sequence.",
      labels: ["research", "visual"]
    },
    {
      id: "task-demo-client-colors",
      title: "Pick final color direction for campaign",
      project: "Client Work",
      priority: "P2",
      due: dates.today,
      description:
        "Compare the two muted palettes and choose the direction that feels calmer on mobile.",
      labels: ["client", "visual", "review"]
    },
    {
      id: "task-demo-coffee",
      title: "Buy coffee beans",
      project: "Personal",
      priority: "P4",
      due: dates.today,
      labels: ["errand"]
    },
    {
      id: "task-demo-water-plants",
      title: "Water plants",
      project: "Home",
      priority: "P4",
      due: dates.today,
      labels: ["home"]
    },
    {
      id: "task-demo-evening-walk",
      title: "Evening walk",
      project: "Health",
      priority: "P4",
      due: dates.today,
      labels: ["health"]
    },
    {
      id: "task-demo-invoice",
      title: "Send invoice to studio",
      project: "Studio Admin",
      priority: "P1",
      due: dates.yesterday,
      deadline: dates.today,
      description:
        "Prepare and send the invoice for last week's animation revisions.",
      labels: ["admin", "urgent"]
    },
    {
      id: "task-demo-clean-screenshots",
      title: "Clean desktop screenshots folder",
      project: "Personal",
      priority: "P3",
      due: dates.yesterday,
      labels: ["admin"]
    },
    {
      id: "task-demo-feedback",
      title: "Review client feedback notes",
      project: "Client Work",
      priority: "P2",
      due: dates.yesterday,
      labels: ["client", "review"]
    },
    {
      id: "task-demo-reel-notes",
      title: "Trim rough reel notes",
      project: "Motion Reel",
      priority: "P3",
      due: dates.yesterday,
      description: "Cut the notes down to the strongest sequence ideas.",
      labels: ["writing", "review"]
    },
    {
      id: "task-demo-handoff",
      title: "Prepare Figma handoff notes",
      project: "Client Work",
      priority: "P2",
      due: dates.tomorrow,
      deadline: dates.plus3,
      labels: ["client", "admin"]
    },
    {
      id: "task-demo-screen-capture",
      title: "Record 10-second screen capture for portfolio",
      project: "Portfolio",
      priority: "P3",
      due: dates.plus2,
      labels: ["visual", "review"]
    },
    {
      id: "task-demo-reel",
      title: "Render motion reel typography test",
      project: "Motion Reel",
      priority: "P2",
      due: dates.plus3,
      description: "Export a rough pass with the new type rhythm and timing marks.",
      labels: ["visual"],
      attachments: [attachmentPaths.reelFrame]
    },
    {
      id: "task-demo-contract",
      title: "Review freelance contract notes",
      project: "Studio Admin",
      priority: "P2",
      due: dates.plus2,
      labels: ["admin", "review", "urgent"]
    },
    {
      id: "task-demo-shelf",
      title: "Fix loose shelf screw",
      project: "Home",
      priority: "P3",
      due: dates.plus3,
      labels: ["home"]
    },
    {
      id: "task-demo-backup",
      title: "Backup project archive",
      project: "Studio Admin",
      priority: "P3",
      due: dates.plus7,
      labels: ["admin"]
    },
    {
      id: "task-demo-dentist",
      title: "Book dentist appointment",
      project: "Health",
      priority: "P4",
      due: dates.plus7,
      labels: ["health"]
    },
    {
      id: "task-demo-color-board",
      title: "Make a small research board about Notion-like colors",
      project: "Research",
      priority: "P4",
      due: dates.plus14,
      labels: ["research", "idea"]
    },
    {
      id: "task-demo-detail-layout",
      title: "Try a new task detail layout idea",
      project: "Inbox",
      priority: "P4",
      description: "Maybe split the detail modal into content and metadata sections.",
      labels: ["idea"]
    },
    {
      id: "task-demo-series-names",
      title: "List possible names for the next visual series",
      project: "Inbox",
      priority: "P4",
      labels: ["idea", "writing"]
    },
    {
      id: "task-demo-asset-library",
      title: "Organize asset library",
      project: "Studio Admin",
      priority: "P3",
      description: "Move shared textures, brushes, and client exports into clearer folders.",
      labels: ["admin"]
    },
    {
      id: "task-demo-reading-list",
      title: "Collect articles about creative tooling",
      project: "Research",
      priority: "P4",
      labels: ["research", "idea"]
    },
    {
      id: "task-demo-moodboard-link",
      title: "Send moodboard link",
      project: "Client Work",
      priority: "P2",
      due: dates.yesterday,
      completed: true,
      completedDate: dates.yesterday,
      labels: ["client", "visual"]
    },
    {
      id: "task-demo-readme-notes",
      title: "Update plugin README screenshot notes",
      project: "Research",
      priority: "P3",
      due: dates.today,
      completed: true,
      completedDate: dates.today,
      labels: ["writing"]
    },
    {
      id: "task-demo-rename-folder",
      title: "Rename old export folder",
      project: "Studio Admin",
      priority: "P4",
      completed: true,
      completedDate: dates.today,
      labels: ["admin"]
    }
  ];

  return {
    tasks: specs.map((spec, order) => taskFromSpec(spec, order, sourcePath, dates.today)),
    attachments: [
      {
        path: attachmentPaths.moodboard,
        content: moodboardSvg()
      },
      {
        path: attachmentPaths.logoOptions,
        content: logoOptionsSvg()
      },
      {
        path: attachmentPaths.logoGrid,
        content: logoGridSvg()
      },
      {
        path: attachmentPaths.caseStudy,
        content: [
          "Portfolio case study notes",
          "",
          "- Focus on the concept before showing the output.",
          "- Keep the writing compact and image-led.",
          "- Add a short note about process sketches and final interaction."
        ].join("\n")
      },
      {
        path: attachmentPaths.reelFrame,
        content: reelFrameSvg()
      }
    ]
  };
}

function taskFromSpec(
  spec: DemoTaskSpec,
  order: number,
  sourcePath: string,
  created: string
): BelkiTask {
  return {
    id: spec.id,
    title: spec.title,
    completed: Boolean(spec.completed),
    completedDate: spec.completedDate,
    created,
    due: spec.due,
    deadline: spec.deadline,
    project: spec.project,
    priority: spec.priority,
    description: spec.description,
    labels: spec.labels || [],
    attachments: spec.attachments || [],
    extraProperties: [],
    order,
    sourcePath
  };
}

function attachmentPath(attachmentsDir: string, taskId: string, filename: string): string {
  return normalizePath(`${attachmentsDir}/${taskId}/${filename}`);
}

function moodboardSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">',
    '<rect width="960" height="600" fill="#f7f7f5"/>',
    '<rect x="64" y="64" width="250" height="190" rx="24" fill="#DDEDEA"/>',
    '<rect x="354" y="64" width="250" height="190" rx="24" fill="#EAE5F2"/>',
    '<rect x="644" y="64" width="250" height="190" rx="24" fill="#FAEBDD"/>',
    '<rect x="64" y="304" width="395" height="210" rx="24" fill="#DDEBF1"/>',
    '<rect x="499" y="304" width="395" height="210" rx="24" fill="#FBF3DA"/>',
    '<text x="72" y="560" font-family="Inter, Arial, sans-serif" font-size="34" fill="#37352f">Homepage moodboard</text>',
    '</svg>'
  ].join("");
}

function logoOptionsSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">',
    '<rect width="960" height="600" fill="#ffffff"/>',
    '<circle cx="190" cy="180" r="72" fill="#0E7B6C"/>',
    '<text x="310" y="196" font-family="Inter, Arial, sans-serif" font-size="54" fill="#37352f">north studio</text>',
    '<rect x="124" y="330" width="132" height="132" rx="32" fill="#6940A5"/>',
    '<text x="310" y="410" font-family="Inter, Arial, sans-serif" font-size="54" fill="#37352f">north studio</text>',
    '<text x="72" y="548" font-family="Inter, Arial, sans-serif" font-size="28" fill="#787774">logo options</text>',
    '</svg>'
  ].join("");
}

function logoGridSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">',
    '<rect width="960" height="600" fill="#f7f7f5"/>',
    '<g fill="#37352f">',
    '<rect x="120" y="100" width="160" height="160" rx="42"/>',
    '<circle cx="480" cy="180" r="82"/>',
    '<path d="M720 92 L830 260 L610 260 Z"/>',
    '</g>',
    '<g fill="#878B82">',
    '<rect x="120" y="340" width="160" height="160" rx="80"/>',
    '<rect x="398" y="340" width="164" height="164" rx="28"/>',
    '<circle cx="720" cy="422" r="84"/>',
    '</g>',
    '</svg>'
  ].join("");
}

function reelFrameSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">',
    '<rect width="960" height="540" fill="#111111"/>',
    '<rect x="80" y="80" width="800" height="380" rx="28" fill="#1f1f1f" stroke="#878B82" stroke-width="2"/>',
    '<text x="120" y="220" font-family="Inter, Arial, sans-serif" font-size="76" fill="#ffffff">motion reel</text>',
    '<text x="124" y="292" font-family="Inter, Arial, sans-serif" font-size="34" fill="#a8a6a1">type rhythm test 01</text>',
    '<circle cx="768" cy="270" r="54" fill="#DFAB00"/>',
    '<circle cx="810" cy="270" r="54" fill="#0C6E99" opacity="0.72"/>',
    '</svg>'
  ].join("");
}
