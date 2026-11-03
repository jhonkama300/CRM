"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowLeft,
  ChevronDown,
  Plus,
  Trash2,
  GripVertical,
  MessageSquare,
  FileText,
  Tag,
  TagIcon,
  UserCheck,
  PencilLine,
  Briefcase,
  Hourglass,
  GitBranch,
  Webhook,
  CircleSlash,
  Zap,
  Loader2,
  ArrowDown,
  ArrowUp,
  MousePointerClick,
  List,
  CheckCircle2,
  Settings2,
  X,
  ClipboardList,
  MapPin,
} from "lucide-react"

import {
  Background,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  MarkerType,
  MiniMap,
  type Edge as CanvasEdge,
  type Node as CanvasNode,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { autoLayout } from "@/lib/flows/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type {
  AccountMember,
  AutomationStepType,
  ConditionStepConfig,
  AutomationTriggerType,
  CustomField,
  InteractiveMessagePayload,
  KeywordMatchTriggerConfig,
  MessageTemplate,
  Tag as TagRecord,
} from "@/types"
import {
  InteractiveBuilder,
  blankButtonsPayload,
  blankListPayload,
} from "@/components/interactive/interactive-builder"
import { interactivePayloadPreviewText } from "@/lib/whatsapp/interactive"
import { createClient } from "@/lib/supabase/client"
import {
  childPath,
  insertAt,
  mapAtPath,
  moveAt,
  removeAt,
  type ParentScope,
  type StepPath,
} from "@/lib/automations/builder-tree"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { validateStepsForActivation } from "@/lib/automations/validate"
import {
  LEGACY_CONDITION_TIMEZONE,
  browserTimeZone,
  editConditionConfig,
  listTimeZones,
} from "@/lib/automations/time-of-day"

// ------------------------------------------------------------
// Types (builder-local — mirror the flattened rows we POST)
// ------------------------------------------------------------

export interface BuilderStep {
  /** Client id; the API assigns real UUIDs server-side. */
  cid: string
  id?: string
  step_type: AutomationStepType
  step_config: Record<string, unknown>
  position_x?: number | null
  position_y?: number | null
  branches?: { yes: BuilderStep[]; no: BuilderStep[] }
}

export interface BuilderEdge {
  source_step_id: string | null
  source_port: string
  target_step_id: string
  position?: number
}

type StepClipboard = {
  step: BuilderStep
  scope: ParentScope
  index: number
  edges: BuilderEdge[]
}

export interface BuilderInitial {
  id?: string
  name: string
  description: string
  trigger_type: AutomationTriggerType
  trigger_config: Record<string, unknown>
  is_active: boolean
  steps: BuilderStep[]
  edges?: BuilderEdge[]
}

// ------------------------------------------------------------
// Step metadata — one source of truth for icon + label + border color
// ------------------------------------------------------------

interface StepMeta {
  label: string
  icon: typeof Zap
  /** Left-border accent color per spec. */
  border: string
}

const STEP_META: Record<AutomationStepType, StepMeta> = {
  send_message: { label: "send_message", icon: MessageSquare, border: "border-l-primary" },
  send_buttons: { label: "send_buttons", icon: MousePointerClick, border: "border-l-primary" },
  send_list: { label: "send_list", icon: List, border: "border-l-primary" },
  send_template: { label: "send_template", icon: FileText, border: "border-l-primary" },
  add_tag: { label: "add_tag", icon: Tag, border: "border-l-primary" },
  remove_tag: { label: "remove_tag", icon: TagIcon, border: "border-l-primary" },
  assign_conversation: { label: "assign_conversation", icon: UserCheck, border: "border-l-primary" },
  update_contact_field: { label: "update_contact_field", icon: PencilLine, border: "border-l-primary" },
  create_deal: { label: "create_deal", icon: Briefcase, border: "border-l-primary" },
  wait: { label: "wait", icon: Hourglass, border: "border-l-border" },
  condition: { label: "condition", icon: GitBranch, border: "border-l-amber-500" },
  ab_split: { label: "ab_split", icon: GitBranch, border: "border-l-amber-500" },
  handoff: { label: "handoff", icon: UserCheck, border: "border-l-fuchsia-500" },
  ask_data: { label: "ask_data", icon: PencilLine, border: "border-l-violet-500" },
  send_flow: { label: "send_flow", icon: ClipboardList, border: "border-l-violet-500" },
  ask_location: { label: "ask_location", icon: MapPin, border: "border-l-violet-500" },
  send_webhook: { label: "send_webhook", icon: Webhook, border: "border-l-primary" },
  close_conversation: { label: "close_conversation", icon: CircleSlash, border: "border-l-primary" },
}

const ADDABLE_STEPS: AutomationStepType[] = [
  "send_message",
  "send_buttons",
  "send_list",
  "send_template",
  "add_tag",
  "remove_tag",
  "assign_conversation",
  "update_contact_field",
  "create_deal",
  "wait",
  "condition",
  "ab_split",
  "ask_data",
  "ask_location",
  "send_flow",
  "handoff",
  "send_webhook",
  "close_conversation",
]

const PALETTE_GROUPS: { key: string; steps: AutomationStepType[] }[] = [
  { key: "send", steps: ["send_message", "send_template", "send_flow"] },
  { key: "ask", steps: ["send_buttons", "send_list", "ask_data", "ask_location"] },
  { key: "logic", steps: ["wait", "condition", "ab_split", "send_webhook"] },
  { key: "finish", steps: ["handoff"] },
  {
    key: "crm",
    steps: [
      "add_tag",
      "remove_tag",
      "assign_conversation",
      "update_contact_field",
      "create_deal",
      "close_conversation",
    ],
  },
]

const GROUP_STYLE: Record<
  string,
  { border: string; icon: string; text: string; dot: string }
> = {
  send: {
    border: "border-l-sky-500",
    icon: "bg-sky-500/15 text-sky-400",
    text: "text-sky-400",
    dot: "bg-sky-400",
  },
  ask: {
    border: "border-l-violet-500",
    icon: "bg-violet-500/15 text-violet-400",
    text: "text-violet-400",
    dot: "bg-violet-400",
  },
  logic: {
    border: "border-l-amber-500",
    icon: "bg-amber-500/15 text-amber-400",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  crm: {
    border: "border-l-emerald-500",
    icon: "bg-emerald-500/15 text-emerald-400",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  finish: {
    border: "border-l-fuchsia-500",
    icon: "bg-fuchsia-500/15 text-fuchsia-400",
    text: "text-fuchsia-400",
    dot: "bg-fuchsia-400",
  },
}

function groupForStep(type: AutomationStepType): string {
  return (
    PALETTE_GROUPS.find((group) => group.steps.includes(type))?.key ?? "send"
  )
}

function countSendSteps(steps: BuilderStep[]): number {
  let count = 0
  for (const step of steps) {
    if (
      [
        "send_message",
        "send_buttons",
        "send_list",
        "send_template",
        "ask_data",
        "ask_location",
        "send_flow",
      ].includes(step.step_type)
    ) {
      count += 1
    }
    if ((step.step_type === "condition" || step.step_type === "ab_split") && step.branches) {
      count += countSendSteps(step.branches.yes)
      count += countSendSteps(step.branches.no)
    }
  }
  return count
}

function deriveTreeEdges(steps: BuilderStep[]): BuilderEdge[] {
  const edges: BuilderEdge[] = []
  function walk(list: BuilderStep[], parentId: string | null, sourcePort: string) {
    let previous = parentId
    let first = true
    for (const step of list) {
      const target = step.id ?? step.cid
      edges.push({
        source_step_id: previous,
        source_port: first ? sourcePort : "default",
        target_step_id: target,
      })
      previous = target
      first = false
      if ((step.step_type === "condition" || step.step_type === "ab_split") && step.branches) {
        walk(step.branches.yes, target, "yes")
        walk(step.branches.no, target, "no")
      }
    }
  }
  walk(steps, null, "default")
  return edges
}

interface LocatedStep {
  step: BuilderStep
  path: StepPath
  scope: ParentScope
  index: number
  total: number
}

function findStepByCid(
  steps: BuilderStep[],
  cid: string,
  basePath: StepPath = [],
  scope: ParentScope = { kind: "root" },
): LocatedStep | null {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    const path = childPath(basePath, scope, index)
    if (step.cid === cid || step.id === cid) {
      return { step, path, scope, index, total: steps.length }
    }
    if ((step.step_type === "condition" || step.step_type === "ab_split") && step.branches) {
      const yes = findStepByCid(
        step.branches.yes,
        cid,
        path,
        { kind: "branch", parentCid: step.cid, branch: "yes" },
      )
      if (yes) return yes
      const no = findStepByCid(
        step.branches.no,
        cid,
        path,
        { kind: "branch", parentCid: step.cid, branch: "no" },
      )
      if (no) return no
    }
  }
  return null
}

const TRIGGER_OPTIONS: { value: AutomationTriggerType }[] = [
  { value: "new_message_received" },
  { value: "first_inbound_message" },
  { value: "keyword_match" },
  { value: "interactive_reply" },
  { value: "new_contact_created" },
  { value: "conversation_assigned" },
  { value: "tag_added" },
  { value: "time_based" },
]

function cid(): string {
  return (
    "c_" +
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36))
  )
}

function newStepId(): string | undefined {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : undefined
}

// The send_buttons / send_list step_config IS an InteractiveMessagePayload,
// but step_config is typed generically as Record<string, unknown>. These two
// helpers hold the single unavoidable structural cast in one place so a
// payload-shape change has one seam to update instead of four scattered
// `as unknown as` sites.
function toStepConfig(p: InteractiveMessagePayload): Record<string, unknown> {
  return p as unknown as Record<string, unknown>
}
function asInteractive(cfg: Record<string, unknown>): InteractiveMessagePayload {
  return cfg as unknown as InteractiveMessagePayload
}

function blankConfig(type: AutomationStepType): Record<string, unknown> {
  switch (type) {
    case "send_message":
      return { text: "" }
    case "send_buttons":
      return toStepConfig(blankButtonsPayload())
    case "send_list":
      return toStepConfig(blankListPayload())
    case "send_template":
      return { template_name: "", language: "en_US" }
    case "add_tag":
    case "remove_tag":
      return { tag_id: "" }
    case "assign_conversation":
      return { mode: "round_robin" }
    case "update_contact_field":
      return { field: "name", value: "" }
    case "create_deal":
      return { pipeline_id: "", stage_id: "", title: "", value: 0 }
    case "wait":
      return { amount: 1, unit: "hours" }
    case "condition":
      return { subject: "tag_presence", operand: "", value: "" }
    case "send_flow":
      return { flow_id: "", screen: "", body: "", cta: "Abrir", action: "navigate" }
    case "ask_data":
      return { message: "", field: "name" }
    case "ask_location":
      return { message: "", field: "name" }
    case "ab_split":
    case "handoff":
    case "send_webhook":
      return type === "send_webhook" ? { url: "", headers: {}, body_template: "" } : {}
    case "close_conversation":
      return {}
    default:
      return {}
  }
}

// ------------------------------------------------------------
// Account resources (tags, members, approved templates, pipelines)
//
// Loaded once at the builder root and shared via context so the
// tag / agent / template pickers below can offer existing resources
// by name instead of asking the user to paste raw UUIDs. Every picker
// falls back to a raw input when its list is empty (fresh account or
// an older deployment), so an automation is always authorable.
// ------------------------------------------------------------

interface WhatsAppFlowOption {
  id: string
  name: string
  status?: string
}

interface AutomationResources {
  tags: TagRecord[]
  members: AccountMember[]
  templates: MessageTemplate[]
  customFields: CustomField[]
  pipelines: PipelineOption[]
  stages: PipelineStageOption[]
  flows: WhatsAppFlowOption[]
}

interface PipelineOption {
  id: string
  name: string
}

interface PipelineStageOption {
  id: string
  name: string
  pipeline_id: string
  position: number
}

const ResourcesContext = createContext<AutomationResources>({
  tags: [],
  members: [],
  templates: [],
  customFields: [],
  pipelines: [],
  stages: [],
  flows: [],
})

function useResources(): AutomationResources {
  return useContext(ResourcesContext)
}

function ResourcesProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<TagRecord[]>([])
  const [members, setMembers] = useState<AccountMember[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [pipelines, setPipelines] = useState<PipelineOption[]>([])
  const [stages, setStages] = useState<PipelineStageOption[]>([])
  const [flows, setFlows] = useState<WhatsAppFlowOption[]>([])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    // Tags, templates and custom fields come straight from the DB — RLS
    // scopes them to the caller's account. Only APPROVED templates can
    // actually be sent (anything else 400s at send time), matching the
    // broadcast picker.
    void (async () => {
      const [tagsRes, templatesRes, customFieldsRes, pipelinesRes, stagesRes] =
        await Promise.all([
          supabase.from("tags").select("*").order("name"),
          supabase
            .from("message_templates")
            .select("*")
            .eq("status", "APPROVED")
            .order("name"),
          supabase.from("custom_fields").select("*").order("field_name"),
          supabase.from("pipelines").select("id, name").order("name"),
          supabase
            .from("pipeline_stages")
            .select("id, name, pipeline_id, position")
            .order("position"),
        ])
      if (cancelled) return
      setTags((tagsRes.data as TagRecord[] | null) ?? [])
      setTemplates((templatesRes.data as MessageTemplate[] | null) ?? [])
      setCustomFields((customFieldsRes.data as CustomField[] | null) ?? [])
      setPipelines((pipelinesRes.data as PipelineOption[] | null) ?? [])
      setStages((stagesRes.data as PipelineStageOption[] | null) ?? [])
    })()

    void (async () => {
      try {
        const res = await fetch("/api/whatsapp/flows", { cache: "no-store" })
        if (!res.ok) return
        const json = (await res.json()) as { flows?: WhatsAppFlowOption[] }
        if (!cancelled) setFlows(json.flows ?? [])
      } catch {
        // Meta flows unavailable - keep the manual ID input.
      }
    })()

    // Members go through the API so we inherit its email-visibility
    // rules (agents/viewers don't see emails). Unreachable on older
    // deployments → pickers fall back to a raw agent-id input.
    void (async () => {
      try {
        const res = await fetch("/api/account/members", { cache: "no-store" })
        if (!res.ok) return
        const json = (await res.json()) as { members?: AccountMember[] }
        if (!cancelled) setMembers(json.members ?? [])
      } catch {
        // Members endpoint absent — caller falls back to raw input.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ResourcesContext.Provider
      value={{ tags, members, templates, customFields, pipelines, stages, flows }}
    >
      {children}
    </ResourcesContext.Provider>
  )
}

const SELECT_CLASS =
  "w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"

function FlowIdInput({
  value,
  onChange,
  t,
}: {
  value: string
  onChange: (v: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { flows } = useResources()
  const selected = flows.find((flow) => flow.id === value)
  return (
    <>
      <Input
        list="automation-flow-options"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-muted text-foreground"
      />
      <datalist id="automation-flow-options">
        {flows.map((flow) => (
          <option key={flow.id} value={flow.id}>
            {flow.name}
          </option>
        ))}
      </datalist>
      {selected && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {selected.name}
          {selected.status ? ` · ${selected.status}` : ""}
        </p>
      )}
      {!selected && flows.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("config.flowPick")}
        </p>
      )}
    </>
  )
}

/** Tag dropdown by name + color, storing the tag's id. Falls back to a
 *  raw id input when no tags exist yet. */
function TagSelect({
  value,
  onChange,
  t,
}: {
  value: string
  onChange: (v: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { tags } = useResources()
  if (tags.length === 0) {
    return (
      <Input
        placeholder={t("tags.placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-muted text-foreground"
      />
    )
  }
  const selected = tags.find((t) => t.id === value)
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-3 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: selected?.color ?? "transparent" }}
        aria-hidden
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{t("tags.select")}</option>
        {tags.map((tg) => (
          <option key={tg.id} value={tg.id}>
            {tg.name}
          </option>
        ))}
        {/* Preserve a saved tag that's since been deleted so editing an
            existing automation doesn't silently drop it. */}
        {value && !selected && (
          <option value={value}>{t("tags.unknown", { id: value })}</option>
        )}
      </select>
    </div>
  )
}

/** Contact-field dropdown for "Update Contact Field": built-in columns plus
 *  any account custom fields (stored as `custom:<id>`). A saved custom field
 *  that's since been deleted is preserved as a labelled option so editing an
 *  existing automation doesn't silently drop it. */
function ContactFieldSelect({
  value,
  onChange,
  t,
  allowEmpty = false,
}: {
  value: string
  onChange: (v: string) => void
  t: ReturnType<typeof useTranslations>
  allowEmpty?: boolean
}) {
  const { customFields } = useResources()
  const customValue = value.startsWith("custom:") ? value : ""
  const knownCustom =
    customValue && customFields.some((f) => `custom:${f.id}` === customValue)
  return (
    <select
      value={value || (allowEmpty ? "" : "name")}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
    >
      {allowEmpty && <option value="">{t("fields.none")}</option>}
      <option value="name">{t("fields.name")}</option>
      <option value="email">{t("fields.email")}</option>
      <option value="company">{t("fields.company")}</option>
      {customFields.length > 0 && (
        <optgroup label={t("fields.customFields")}>
          {customFields.map((f) => (
            <option key={f.id} value={`custom:${f.id}`}>
              {f.field_name}
            </option>
          ))}
        </optgroup>
      )}
      {customValue && !knownCustom && (
        <option value={customValue}>{t("fields.unknown", { id: customValue })}</option>
      )}
    </select>
  )
}

/** Agent dropdown by name, storing the member's user_id. Falls back to
 *  a raw id input when the member list is unavailable. */
function AgentSelect({
  value,
  onChange,
  t,
}: {
  value: string
  onChange: (v: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { members } = useResources()
  if (members.length === 0) {
    return (
      <Input
        placeholder={t("agents.placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-muted text-foreground"
      />
    )
  }
  const selected = members.find((m) => m.user_id === value)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">{t("agents.select")}</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.full_name || m.email || m.user_id}
        </option>
      ))}
      {value && !selected && (
        <option value={value}>{t("agents.unknown", { id: value })}</option>
      )}
    </select>
  )
}

/** Pipeline + stage picker for Create Deal. The automation stores ids because
 *  the engine writes directly to deals, but authors should choose by name. */
function DealPipelineFields({
  pipelineId,
  stageId,
  onChange,
  t,
}: {
  pipelineId: string
  stageId: string
  onChange: (patch: { pipeline_id: string; stage_id: string }) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { pipelines, stages } = useResources()

  if (pipelines.length === 0) {
    return (
      <>
        <FieldBlock label={t("pipelines.pipelineIdLabel")}>
          <Input
            value={pipelineId}
            onChange={(e) =>
              onChange({ pipeline_id: e.target.value, stage_id: stageId })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
        <FieldBlock label={t("pipelines.stageIdLabel")}>
          <Input
            value={stageId}
            onChange={(e) =>
              onChange({ pipeline_id: pipelineId, stage_id: e.target.value })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
      </>
    )
  }

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId)
  const stageOptions = stages.filter((s) => s.pipeline_id === pipelineId)
  const selectedStage = stageOptions.find((s) => s.id === stageId)

  return (
    <>
      <FieldBlock label={t("pipelines.pipelineLabel")}>
        <select
          value={pipelineId}
          onChange={(e) => {
            const nextPipelineId = e.target.value
            const firstStage = stages.find(
              (s) => s.pipeline_id === nextPipelineId
            )
            onChange({
              pipeline_id: nextPipelineId,
              stage_id: firstStage?.id ?? "",
            })
          }}
          className={SELECT_CLASS}
        >
          <option value="">{t("pipelines.selectPipeline")}</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {pipelineId && !selectedPipeline && (
            <option value={pipelineId}>{t("pipelines.unknownPipeline", { id: pipelineId })}</option>
          )}
        </select>
      </FieldBlock>
      <FieldBlock label={t("pipelines.stageLabel")}>
        <select
          value={stageId}
          onChange={(e) =>
            onChange({ pipeline_id: pipelineId, stage_id: e.target.value })
          }
          className={SELECT_CLASS}
          disabled={!pipelineId || stageOptions.length === 0}
        >
          <option value="">
            {pipelineId ? t("pipelines.selectStage") : t("pipelines.selectPipelineFirst")}
          </option>
          {stageOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {stageId && pipelineId && !selectedStage && (
            <option value={stageId}>{t("pipelines.unknownStage", { id: stageId })}</option>
          )}
        </select>
      </FieldBlock>
    </>
  )
}

/** Template dropdown showing approved templates by name + language,
 *  storing both template_name and language. Falls back to manual name +
 *  language inputs when no approved templates are synced yet. */
function SendTemplateFields({
  templateName,
  language,
  onChange,
  t,
}: {
  templateName: string
  language: string
  onChange: (patch: { template_name: string; language: string }) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { templates } = useResources()

  if (templates.length === 0) {
    return (
      <>
        <FieldBlock label={t("templates.templateNameLabel")}>
          <Input
            value={templateName}
            onChange={(e) =>
              onChange({ template_name: e.target.value, language })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
        <FieldBlock label={t("templates.languageLabel")}>
          <Input
            value={language}
            onChange={(e) =>
              onChange({ template_name: templateName, language: e.target.value })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
      </>
    )
  }

  // Encode name + language in the option value so two templates that
  // share a name across languages stay distinct.
  const toValue = (name: string, lang: string) => `${name}::${lang}`
  const current = templateName ? toValue(templateName, language) : ""
  const hasMatch = templates.some(
    (t) => toValue(t.name, t.language ?? "en_US") === current,
  )

  return (
    <FieldBlock label={t("templates.templateLabel")}>
      <select
        value={current}
        onChange={(e) => {
          const [name, lang] = e.target.value.split("::")
          onChange({ template_name: name ?? "", language: lang ?? "" })
        }}
        className={SELECT_CLASS}
      >
        <option value="">{t("templates.select")}</option>
        {templates.map((tmpl) => {
          const lang = tmpl.language ?? "en_US"
          return (
            <option key={tmpl.id} value={toValue(tmpl.name, lang)}>
              {tmpl.name} ({lang})
            </option>
          )
        })}
        {current && !hasMatch && (
          <option value={current}>
            {t("templates.unknown", { name: templateName, lang: language || t("templates.unknownLang") })}
          </option>
        )}
      </select>
    </FieldBlock>
  )
}

// ------------------------------------------------------------
// Main builder component
// ------------------------------------------------------------

export function AutomationBuilder({ initial }: { initial: BuilderInitial }) {
  const router = useRouter()
  const t = useTranslations("Automations.builder")
  const isEditing = !!initial.id
  const [state, setState] = useState<BuilderInitial>(initial)
  const [edges, setEdges] = useState<BuilderEdge[]>(initial.edges ?? [])
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const nodeClipboardRef = useRef<StepClipboard | null>(null)
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [testText, setTestText] = useState("")
  const [testPath, setTestPath] = useState<string[]>([])
  const selectedStep = expandedId ? findStepByCid(state.steps, expandedId) : null
  const estimatedMessages = useMemo(() => countSendSteps(state.steps), [state.steps])
  const triggerPosition = {
    x:
      typeof state.trigger_config.__canvas_x === "number"
        ? state.trigger_config.__canvas_x
        : 0,
    y:
      typeof state.trigger_config.__canvas_y === "number"
        ? state.trigger_config.__canvas_y
        : 0,
  }

  useEffect(() => {
    const collectCids = (step: BuilderStep): string[] => [
      step.cid,
      ...(step.branches
        ? [
            ...step.branches.yes.flatMap(collectCids),
            ...step.branches.no.flatMap(collectCids),
          ]
        : []),
    ]

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        !target ||
        target.closest(
          'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
        ) ||
        !target.closest('.react-flow')
      ) {
        return
      }

      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (mod && key === 'v' && nodeClipboardRef.current) {
        event.preventDefault()
        const clip = nodeClipboardRef.current
        const parentExists =
          clip.scope.kind === 'root' ||
          !!findStepByCid(state.steps, clip.scope.parentCid)
        const nextSteps = insertAt(
          state.steps,
          parentExists ? clip.scope : { kind: 'root' },
          parentExists ? clip.index : state.steps.length,
          clip.step,
        )
        setState((s) => ({ ...s, steps: nextSteps }))
        if (edges.length > 0) {
          const known = new Set(nextSteps.flatMap(collectCids))
          setEdges((prev) => {
            const restored = clip.edges.filter(
              (edge) =>
                (edge.source_step_id === null ||
                  known.has(edge.source_step_id)) &&
                known.has(edge.target_step_id),
            )
            const merged = [...prev]
            for (const edge of restored) {
              if (
                !merged.some(
                  (current) =>
                    current.source_step_id === edge.source_step_id &&
                    current.source_port === edge.source_port &&
                    current.target_step_id === edge.target_step_id,
                )
              ) {
                merged.push(edge)
              }
            }
            return merged
          })
        }
        setExpandedId(clip.step.cid)
        nodeClipboardRef.current = null
        return
      }

      if (!selectedStep) return
      const located = findStepByCid(state.steps, selectedStep.step.cid)
      if (!located) return

      if (key === 'delete' || key === 'backspace') {
        event.preventDefault()
        const removed = new Set(collectCids(located.step))
        setState((s) => ({ ...s, steps: removeAt(s.steps, located.path) }))
        setEdges((prev) =>
          prev.filter(
            (edge) =>
              !(
                (edge.source_step_id !== null &&
                  removed.has(edge.source_step_id)) ||
                removed.has(edge.target_step_id)
              ),
          ),
        )
        setExpandedId(null)
        return
      }

      if (mod && key === 'x') {
        event.preventDefault()
        const removed = new Set(collectCids(located.step))
        nodeClipboardRef.current = {
          step: located.step,
          scope: located.scope,
          index: located.index,
          edges: edges.filter(
            (edge) =>
              (edge.source_step_id !== null &&
                removed.has(edge.source_step_id)) ||
              removed.has(edge.target_step_id),
          ),
        }
        setState((s) => ({ ...s, steps: removeAt(s.steps, located.path) }))
        setEdges((prev) =>
          prev.filter(
            (edge) =>
              !(
                (edge.source_step_id !== null &&
                  removed.has(edge.source_step_id)) ||
                removed.has(edge.target_step_id)
              ),
          ),
        )
        setExpandedId(null)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [edges, selectedStep, state.steps])

  function patchTop<K extends keyof BuilderInitial>(key: K, value: BuilderInitial[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  // --- Step tree mutations (immutable) ---

  function updateStep(path: StepPath, updater: (s: BuilderStep) => BuilderStep) {
    setState((s) => ({ ...s, steps: mapAtPath(s.steps, path, updater) }))
  }

  function addStepAt(
    parent: ParentScope,
    index: number,
    type: AutomationStepType,
    position?: { x: number; y: number },
  ) {
    const node: BuilderStep = {
      cid: cid(),
      id: newStepId(),
      step_type: type,
      step_config: blankConfig(type),
      position_x: position?.x ?? null,
      position_y: position?.y ?? null,
      branches:
        type === "condition" || type === "ab_split"
          ? { yes: [], no: [] }
          : undefined,
    }
    setState((s) => ({ ...s, steps: insertAt(s.steps, parent, index, node) }))
    setExpandedId(node.cid)
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const type = event.dataTransfer.getData("application/x-automation-step") as AutomationStepType
    if (!ADDABLE_STEPS.includes(type)) return
    addStepAt({ kind: "root" }, state.steps.length, type)
  }

  function updateStepPosition(cid: string, x: number, y: number) {
    const located = findStepByCid(state.steps, cid)
    if (!located) return
    updateStep(located.path, (step) => ({ ...step, position_x: x, position_y: y }))
  }

  function deleteStepAt(path: StepPath) {
    setState((s) => ({ ...s, steps: removeAt(s.steps, path) }))
  }

  function moveStepAt(path: StepPath, direction: -1 | 1) {
    setState((s) => ({ ...s, steps: moveAt(s.steps, path, direction) }))
  }

  function runTest() {
    const graph = edges.length > 0 ? edges : deriveTreeEdges(state.steps)
    const byId = new Map<string, BuilderStep>()
    const collect = (list: BuilderStep[]) => {
      for (const step of list) {
        byId.set(step.id ?? step.cid, step)
        if ((step.step_type === "condition" || step.step_type === "ab_split") && step.branches) {
          collect(step.branches.yes)
          collect(step.branches.no)
        }
      }
    }
    collect(state.steps)
    const path: string[] = []
    const visited = new Set<string>()
    let current = graph.find((edge) => edge.source_step_id === null)?.target_step_id
    while (current && !visited.has(current) && path.length < 50) {
      visited.add(current)
      const step = byId.get(current)
      if (!step) break
      path.push(t(`steps.${STEP_META[step.step_type].label}`))
      let port = "default"
      if ((step.step_type === "condition" || step.step_type === "ab_split")) {
        const cfg = step.step_config as unknown as ConditionStepConfig
        const needle = (cfg.value ?? "").toLowerCase()
        const matches =
          cfg.subject !== "message_content" ||
          !needle ||
          testText.toLowerCase().includes(needle)
        port = matches ? "yes" : "no"
      } else if (step.step_type === "send_buttons" || step.step_type === "send_list") {
        const buttons = Array.isArray(step.step_config.buttons)
          ? (step.step_config.buttons as Array<{ id?: string; title?: string }>)
          : []
        const sections = Array.isArray(step.step_config.sections)
          ? (step.step_config.sections as Array<{ rows?: Array<{ id?: string; title?: string }> }>)
          : []
        const options = [
          ...buttons,
          ...sections.flatMap((section) => section.rows ?? []),
        ]
        const match = options.find(
          (option) =>
            (option.id ?? "").toLowerCase() === testText.trim().toLowerCase() ||
            (option.title ?? "").toLowerCase() === testText.trim().toLowerCase(),
        )
        port = match?.id ?? "other"
      }
      const outgoing = graph.filter((edge) => edge.source_step_id === current)
      current =
        outgoing.find((edge) => edge.source_port === port)?.target_step_id ??
        outgoing.find((edge) => edge.source_port === "default")?.target_step_id ??
        outgoing[0]?.target_step_id
    }
    setTestPath(path)
  }

  function review() {
    const issues = validateStepsForActivation(toApiSteps(state.steps))
    if (issues.length > 0) {
      toast.error(
        issues.length === 1
          ? issues[0].message
          : t("reviewIssues", { count: issues.length }),
      )
      return
    }
    toast.success(t("reviewOk"))
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        name: state.name || t("untitled"),
        description: state.description || null,
        trigger_type: state.trigger_type,
        trigger_config: state.trigger_config,
        is_active: state.is_active,
        steps: toApiSteps(state.steps),
        edges,
      }

      const res = isEditing
        ? await fetch(`/api/automations/${initial.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/automations`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // If the server blocked activation with validation issues,
        // surface the first concrete problem so the user can fix it
        // without opening DevTools for the full array.
        const firstIssue: { path?: string; message?: string } | undefined =
          body?.issues?.[0]
        if (firstIssue?.message) {
          toast.error(firstIssue.message, {
            description: firstIssue.path ? t("toasts.issueAt", { path: firstIssue.path }) : undefined,
          })
        } else {
          toast.error(body?.error ?? t("toasts.saveFailed"))
        }
        return
      }
      toast.success(isEditing ? t("toasts.saved") : t("toasts.created"))
      if (!isEditing && body?.automation?.id) {
        router.replace(`/automations/${body.automation.id}/edit`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Top bar. At sub-sm widths the "Active" label is hidden and the
          switch moves to the right of the save button, so the name input
          gets maximum width. */}
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 py-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => router.push("/automations")}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("backToAutomations")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          value={state.name}
          onChange={(e) => patchTop("name", e.target.value)}
          placeholder={t("untitled")}
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:bg-muted focus:outline-none sm:text-base"
        />
        <div className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
          <span>{t("stepsCount", { count: state.steps.length })}</span>
          <span>{t("estimatedMessages", { count: estimatedMessages })}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">
            {state.is_active ? t("active") : t("paused")}
          </span>
          <Switch
            checked={state.is_active}
            onCheckedChange={(v) => patchTop("is_active", !!v)}
            aria-label={t("activeAria")}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTestOpen(true)}
          className="hidden md:inline-flex"
        >
          {t("test")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTriggerOpen(true)}
          className="hidden md:inline-flex"
        >
          <Settings2 className="h-4 w-4" />
          {t("configure")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={review}
          className="hidden sm:inline-flex"
        >
          <CheckCircle2 className="h-4 w-4" />
          {t("review")}
        </Button>
        <Button
          onClick={save}
          disabled={saving}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isEditing ? t("save") : t("saveDraft")}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <BuilderPalette
          t={t}
          onPick={(type) => addStepAt({ kind: "root" }, state.steps.length, type)}
        />

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto xl:hidden" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            <div className="absolute inset-0 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />
            <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-0 px-4 py-10">
              <ResourcesProvider>
                <TriggerCard
                  type={state.trigger_type}
                  config={state.trigger_config}
                  onTypeChange={(tVal) => patchTop("trigger_type", tVal)}
                  onConfigChange={(c) => patchTop("trigger_config", c)}
                  t={t}
                />
                <StepList
                  steps={state.steps}
                  basePath={[]}
                  scope={{ kind: "root" }}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  updateStep={updateStep}
                  addStepAt={addStepAt}
                  deleteStepAt={deleteStepAt}
                  moveStepAt={moveStepAt}
                />
              </ResourcesProvider>
            </div>
          </div>
          <div className="hidden h-full xl:block" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            <AutomationCanvas
              steps={state.steps}
              triggerLabel={t(`triggers.${state.trigger_type}.label`)}
              selectedId={expandedId}
              onSelect={setExpandedId}
              onPositionChange={updateStepPosition}
              triggerPosition={triggerPosition}
              onTriggerPositionChange={(x, y) =>
                patchTop("trigger_config", {
                  ...state.trigger_config,
                  __canvas_x: x,
                  __canvas_y: y,
                })
              }
              onDropStep={(type, position) =>
                addStepAt({ kind: "root" }, state.steps.length, type, position)
              }
              edges={edges}
              onConnect={(edge, base) => {
                const exists = base.some(
                  (e) =>
                    e.source_step_id === edge.source_step_id &&
                    e.source_port === edge.source_port &&
                    e.target_step_id === edge.target_step_id,
                )
                if (!exists) setEdges([...base, edge])
              }}
              onEdgesReplace={setEdges}
              onClearStepSelection={() => setExpandedId(null)}
              t={t}
            />
          </div>
        </div>

        <InspectorPanel
          t={t}
          triggerLabel={t(`triggers.${state.trigger_type}.label`)}
          stepCount={state.steps.length}
          onReview={review}
          selected={selectedStep}
          onUpdateStep={updateStep}
          onDeleteStep={deleteStepAt}
          onMoveStep={moveStepAt}
          onCloseStep={() => setExpandedId(null)}
        />
      </div>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("testTitle")}</DialogTitle>
            <DialogDescription>{t("testDesc")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={testText}
            onChange={(event) => setTestText(event.target.value)}
            placeholder={t("testPlaceholder")}
            rows={3}
            className="bg-muted text-foreground"
          />
          <Button onClick={runTest} className="w-full">
            {t("testRun")}
          </Button>
          <div className="space-y-1 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold text-foreground">
              {t("testPath")}
            </p>
            {testPath.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("testEmpty")}</p>
            ) : (
              testPath.map((item, index) => (
                <p key={`${item}-${index}`} className="text-xs text-muted-foreground">
                  {index + 1}. {item}
                </p>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-popover-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("triggerDialogTitle")}</DialogTitle>
            <DialogDescription>{t("triggerDialogDesc")}</DialogDescription>
          </DialogHeader>
          <ResourcesProvider>
            <TriggerCard
              type={state.trigger_type}
              config={state.trigger_config}
              onTypeChange={(tVal) => patchTop("trigger_type", tVal)}
              onConfigChange={(c) => patchTop("trigger_config", c)}
              t={t}
            />
          </ResourcesProvider>
          <DialogFooter>
            <Button onClick={() => setTriggerOpen(false)}>{t("done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BuilderPalette({
  t,
  onPick,
}: {
  t: ReturnType<typeof useTranslations>
  onPick: (type: AutomationStepType) => void
}) {
  const draggedAt = useRef(0)
  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card/50 xl:flex">
      <div className="border-b border-border p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("palette.title")}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("palette.hint")}</p>
      </div>
      <div className="space-y-4 p-3">
        {PALETTE_GROUPS.map((group) => {
          const groupStyle = GROUP_STYLE[group.key] ?? GROUP_STYLE.send
          return (
          <div key={group.key}>
            <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", groupStyle.dot)} />
              {t(`palette.groups.${group.key}`)}
            </p>
            <div className="space-y-1">
              {group.steps.map((type) => {
                const meta = STEP_META[type]
                const Icon = meta.icon
                return (
                  <button
                    key={type}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      draggedAt.current = Date.now()
                      e.dataTransfer.setData("application/x-automation-step", type)
                    }}
                    onClick={() => {
                      if (Date.now() - draggedAt.current < 400) return
                      onPick(type)
                    }}
                    className="flex w-full cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:border-border hover:bg-muted active:cursor-grabbing"
                  >
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", groupStyle.icon)}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{t(`steps.${meta.label}`)}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {t(`hints.${type}`)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          )
        })}
      </div>
    </aside>
  )
}

function InspectorPanel({
  t,
  triggerLabel,
  stepCount,
  onReview,
  selected,
  onUpdateStep,
  onDeleteStep,
  onMoveStep,
  onCloseStep,
}: {
  t: ReturnType<typeof useTranslations>
  triggerLabel: string
  stepCount: number
  onReview: () => void
  selected: LocatedStep | null
  onUpdateStep: (path: StepPath, updater: (s: BuilderStep) => BuilderStep) => void
  onDeleteStep: (path: StepPath) => void
  onMoveStep: (path: StepPath, direction: -1 | 1) => void
  onCloseStep: () => void
}) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card/50 xl:flex">
      <div className="flex items-center justify-between border-b border-border p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {selected ? t("inspector.stepTitle") : t("inspector.title")}
        </p>
        {selected && (
          <button
            type="button"
            onClick={onCloseStep}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("inspector.closeStep")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {selected ? (
        <div className="space-y-3 p-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-sm font-semibold text-foreground">
              {t(`steps.${STEP_META[selected.step.step_type].label}`)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("inspector.stepHint")}
            </p>
          </div>
          <StepEditor
            step={selected.step}
            onChange={(next) => onUpdateStep(selected.path, () => next)}
          />
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={selected.index === 0}
                aria-label={t("moveUp")}
                onClick={() => onMoveStep(selected.path, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={selected.index === selected.total - 1}
                aria-label={t("moveDown")}
                onClick={() => onMoveStep(selected.path, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onDeleteStep(selected.path)
                onCloseStep()
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("delete")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("inspector.trigger")}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">{triggerLabel}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("inspector.flow")}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {t("stepsCount", { count: stepCount })}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("inspector.stepHint")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onReview} className="w-full">
            <CheckCircle2 className="h-4 w-4" />
            {t("review")}
          </Button>
          <p className="text-[11px] text-muted-foreground">{t("inspector.hint")}</p>
        </div>
      )}
    </aside>
  )
}

interface AutomationCanvasData extends Record<string, unknown> {
  kind: "trigger" | "step"
  cid?: string
  type?: AutomationStepType
  title: string
  subtitle: string
  selected?: boolean
  ports?: Array<{ id: string; label: string }>
}

const STEP_COLOR: Record<AutomationStepType, string> = {
  send_message: "#3b82f6",
  send_template: "#3b82f6",
  send_buttons: "#8b5cf6",
  send_list: "#8b5cf6",
  wait: "#14b8a6",
  condition: "#f97316",
  ab_split: "#f97316",
  ask_data: "#8b5cf6",
  send_flow: "#8b5cf6",
  ask_location: "#8b5cf6",
  handoff: "#d946ef",
  send_webhook: "#0ea5e9",
  add_tag: "#ec4899",
  remove_tag: "#ec4899",
  assign_conversation: "#ec4899",
  update_contact_field: "#ec4899",
  create_deal: "#ec4899",
  close_conversation: "#d946ef",
}

function sourcePortsForStep(step: BuilderStep) {
  if (step.step_type === "condition" || step.step_type === "ab_split") {
    return [
      { id: "yes", label: "A" },
      { id: "no", label: "B" },
    ]
  }
  if (step.step_type === "send_buttons") {
    const buttons = Array.isArray(step.step_config.buttons)
      ? (step.step_config.buttons as Array<{ id?: string; title?: string }>)
      : []
    return [
      ...buttons.map((button, index) => ({
        id: button.id || `btn_${index + 1}`,
        label: button.title || button.id || `Botón ${index + 1}`,
      })),
      { id: "other", label: "Otra respuesta" },
    ]
  }
  if (step.step_type === "send_list") {
    const sections = Array.isArray(step.step_config.sections)
      ? (step.step_config.sections as Array<{
          rows?: Array<{ id?: string; title?: string }>
        }>)
      : []
    return sections.flatMap((section) =>
      (section.rows ?? []).map((row, index) => ({
        id: row.id || `row_${index + 1}`,
        label: row.title || row.id || `Opción ${index + 1}`,
      })),
    )
  }
  return [{ id: "default", label: "Siguiente" }]
}

function AutomationCanvasNode({ data }: NodeProps) {
  const d = data as AutomationCanvasData
  const t = useTranslations("Automations.builder")
  const meta = d.kind === "step" && d.type ? STEP_META[d.type] : null
  const Icon = meta ? meta.icon : Zap
  const group = d.kind === "step" && d.type ? groupForStep(d.type) : "send"
  const color =
    d.kind === "trigger"
      ? "#10b981"
      : d.type
        ? STEP_COLOR[d.type]
        : "#3b82f6"

  return (
    <div
      className={cn(
        "group relative w-[260px] cursor-grab rounded-xl border bg-white text-left shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition-all duration-150 active:cursor-grabbing",
        d.selected
          ? "border-[#8b5cf6] shadow-[0_8px_24px_-6px_rgba(139,92,246,0.35)] ring-2 ring-[#8b5cf6]/25"
          : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_24px_-8px_rgba(15,23,42,0.18)]",
      )}
    >
      <div
        className="h-1 w-full rounded-t-xl"
        style={{ backgroundColor: color }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400"
      />
      <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <p className="truncate text-[11px] font-semibold tracking-wide" style={{ color }}>
          {d.kind === "trigger" ? t("canvas.trigger") : t(`steps.${meta?.label}`)}
        </p>
        <span className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-400">
          {t(`palette.groups.${group}`)}
        </span>
      </div>
      <div className="px-3 pb-3">
        <p className="line-clamp-3 text-[11px] leading-relaxed text-slate-600">
          {d.subtitle}
        </p>
      </div>
      {d.ports && d.ports.length > 1 ? (
        <div className="space-y-0.5 border-t border-slate-100 px-3 py-1.5">
          {d.ports.map((port) => (
            <div
              key={port.id}
              className="relative flex items-center gap-1.5 rounded px-1 py-1 text-[10px] text-slate-500 transition-colors hover:bg-slate-50"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="min-w-0 flex-1 truncate">{port.label}</span>
              <Handle
                id={port.id}
                type="source"
                position={Position.Right}
                style={{ position: "absolute", right: -21, top: "50%", backgroundColor: color }}
                className="!h-2.5 !w-2.5 !border-2 !border-white"
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle
          id="default"
          type="source"
          position={Position.Right}
          style={{ backgroundColor: color }}
          className="!h-2.5 !w-2.5 !border-2 !border-white"
        />
      )}
    </div>
  )
}

function AutomationCanvas({
  steps,
  triggerLabel,
  selectedId,
  onSelect,
  onPositionChange,
  triggerPosition,
  onTriggerPositionChange,
  onDropStep,
  edges,
  onConnect,
  onEdgesReplace,
  onClearStepSelection,
  t,
}: {
  steps: BuilderStep[]
  triggerLabel: string
  selectedId: string | null
  onSelect: (cid: string) => void
  onPositionChange: (cid: string, x: number, y: number) => void
  triggerPosition: { x: number; y: number }
  onTriggerPositionChange: (x: number, y: number) => void
  onDropStep: (type: AutomationStepType, position: { x: number; y: number }) => void
  edges: BuilderEdge[]
  onConnect: (edge: BuilderEdge, base: BuilderEdge[]) => void
  onEdgesReplace: (edges: BuilderEdge[]) => void
  onClearStepSelection: () => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <ReactFlowProvider>
      <AutomationCanvasInner
        steps={steps}
        triggerLabel={triggerLabel}
        selectedId={selectedId}
        onSelect={onSelect}
        onPositionChange={onPositionChange}
        triggerPosition={triggerPosition}
        onTriggerPositionChange={onTriggerPositionChange}
        onDropStep={onDropStep}
        edges={edges}
        onConnect={onConnect}
        onEdgesReplace={onEdgesReplace}
        onClearStepSelection={onClearStepSelection}
        t={t}
      />
    </ReactFlowProvider>
  )
}

function AutomationCanvasInner({
  steps,
  triggerLabel,
  selectedId,
  onSelect,
  onPositionChange,
  triggerPosition,
  onTriggerPositionChange,
  onDropStep,
  edges: savedEdges,
  onConnect,
  onEdgesReplace,
  onClearStepSelection,
  t,
}: {
  steps: BuilderStep[]
  triggerLabel: string
  selectedId: string | null
  onSelect: (cid: string) => void
  onPositionChange: (cid: string, x: number, y: number) => void
  triggerPosition: { x: number; y: number }
  onTriggerPositionChange: (x: number, y: number) => void
  onDropStep: (type: AutomationStepType, position: { x: number; y: number }) => void
  edges: BuilderEdge[]
  onConnect: (edge: BuilderEdge, base: BuilderEdge[]) => void
  onEdgesReplace: (edges: BuilderEdge[]) => void
  onClearStepSelection: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const { screenToFlowPosition, fitView, zoomIn, zoomOut } = useReactFlow()
  const [dragOver, setDragOver] = useState(false)
  const [draggingNode, setDraggingNode] = useState(false)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const edgeClipboardRef = useRef<BuilderEdge | null>(null)

  const { nodes, derivedEdges } = useMemo(() => {
    const nextNodes: CanvasNode[] = [
      {
        id: "trigger",
        type: "automation",
        draggable: true,
        selectable: true,
        position: triggerPosition,
        data: {
          kind: "trigger",
          title: triggerLabel,
          subtitle: t("canvas.triggerHint"),
          ports: [{ id: "default", label: "Siguiente" }],
        } satisfies AutomationCanvasData,
      },
    ]
    const nextEdges: CanvasEdge[] = []

    function addList(
      list: BuilderStep[],
      parentId: string,
      label?: string,
      sourceHandle?: string,
    ) {
      let previous = parentId
      list.forEach((step, index) => {
        const nodeId = step.id ?? step.cid
        nextNodes.push({
          id: nodeId,
          type: "automation",
          draggable: true,
          selectable: true,
          position: { x: 0, y: 0 },
          data: {
            kind: "step",
            type: step.step_type,
            title: t(`steps.${STEP_META[step.step_type].label}`),
            subtitle: previewFor(step, t),
            cid: step.cid,
            ports: sourcePortsForStep(step),
            selected: step.cid === selectedId,
          } satisfies AutomationCanvasData,
        })
        nextEdges.push({
          id: `${previous}->${nodeId}`,
          source: previous,
          target: nodeId,
          sourceHandle: index === 0 ? sourceHandle : undefined,
          label: index === 0 ? label : undefined,
          type: "smoothstep",
          animated: step.cid === selectedId,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
          style: { stroke: "#94a3b8", strokeWidth: 1.4 },
          labelStyle: { fill: "#64748b", fontSize: 10, fontWeight: 600 },
          labelBgStyle: { fill: "#f8fafc" },
        })
        previous = nodeId
        if (
          (step.step_type === "condition" || step.step_type === "ab_split") &&
          step.branches
        ) {
          addList(step.branches.yes, nodeId, t("canvas.yes"), "yes")
          addList(step.branches.no, nodeId, t("canvas.no"), "no")
        }
      })
    }

    addList(steps, "trigger")
    const positions = autoLayout(
      nextNodes.map((n) => ({ id: n.id, width: 260, height: 100 })),
      nextEdges,
      { direction: "LR", rankSep: 96, nodeSep: 48, defaultWidth: 260, defaultHeight: 100 },
    )
    const layoutTrigger = positions.get("trigger") ?? { x: 0, y: 0 }
    const offset = {
      x: triggerPosition.x - layoutTrigger.x,
      y: triggerPosition.y - layoutTrigger.y,
    }
    return {
      nodes: nextNodes.map((n) => {
        if (n.id === "trigger") return n
        const saved = findStepByCid(steps, n.id)?.step
        const savedPosition =
          saved?.position_x != null && saved?.position_y != null
            ? { x: saved.position_x, y: saved.position_y }
            : null
        const auto = positions.get(n.id) ?? n.position
        return {
          ...n,
          position: savedPosition ?? {
            x: auto.x + offset.x,
            y: auto.y + offset.y,
          },
        }
      }),
      derivedEdges: nextEdges,
    }
  }, [steps, triggerLabel, selectedId, triggerPosition, t])

  const displayEdges = savedEdges.length
    ? savedEdges.map((edge, index) => ({
        id: `saved-${index}`,
        source: edge.source_step_id ?? "trigger",
        target: edge.target_step_id,
        sourceHandle: edge.source_port || "default",
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        style: { stroke: "#94a3b8", strokeWidth: 1.4 },
      }))
    : derivedEdges

  useEffect(() => {
    const sameEdge = (a: BuilderEdge, b: BuilderEdge) =>
      a.source_step_id === b.source_step_id &&
      a.source_port === b.source_port &&
      a.target_step_id === b.target_step_id

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        !target ||
        target.closest(
          'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
        ) ||
        !target.closest('.react-flow')
      ) {
        return
      }

      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const materialized: BuilderEdge[] = savedEdges.length
        ? savedEdges
        : derivedEdges.map((edge) => ({
            source_step_id: edge.source === 'trigger' ? null : edge.source,
            source_port: edge.sourceHandle ?? 'default',
            target_step_id: edge.target,
          }))

      if (mod && key === 'v' && edgeClipboardRef.current) {
        event.preventDefault()
        const clip = edgeClipboardRef.current
        const sourceExists =
          clip.source_step_id === null ||
          nodes.some((node) => node.id === clip.source_step_id)
        const targetExists = nodes.some((node) => node.id === clip.target_step_id)
        if (
          sourceExists &&
          targetExists &&
          !materialized.some((edge) => sameEdge(edge, clip))
        ) {
          onEdgesReplace([...materialized, clip])
        }
        edgeClipboardRef.current = null
        setSelectedEdgeId(null)
        return
      }

      if (!selectedEdgeId) return
      const display = savedEdges.length
        ? savedEdges.map((edge, index) => ({
            id: 'saved-' + index,
            edge,
          }))
        : derivedEdges.map((edge) => ({
            id: edge.id,
            edge: {
              source_step_id:
                edge.source === 'trigger' ? null : edge.source,
              source_port: edge.sourceHandle ?? 'default',
              target_step_id: edge.target,
            } satisfies BuilderEdge,
          }))
      const selected = display.find((entry) => entry.id === selectedEdgeId)
      if (!selected) return

      if (key === 'delete' || key === 'backspace') {
        event.preventDefault()
        onEdgesReplace(
          materialized.filter((edge) => !sameEdge(edge, selected.edge)),
        )
        setSelectedEdgeId(null)
        return
      }

      if (mod && key === 'x') {
        event.preventDefault()
        edgeClipboardRef.current = selected.edge
        onEdgesReplace(
          materialized.filter((edge) => !sameEdge(edge, selected.edge)),
        )
        setSelectedEdgeId(null)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    derivedEdges,
    nodes,
    onEdgesReplace,
    savedEdges,
    selectedEdgeId,
  ])

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<CanvasNode>(nodes)

  useEffect(() => {
    setFlowNodes(nodes)
  }, [nodes, setFlowNodes])

  const visualEdges = displayEdges.map((edge) => ({
    ...edge,
    animated: draggingNode || ("animated" in edge && edge.animated === true),
    selected: edge.id === selectedEdgeId,
    style:
      edge.id === selectedEdgeId
        ? { ...edge.style, stroke: "#8b5cf6", strokeWidth: 2.2 }
        : edge.style,
  }))

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fitView({ padding: 0.2, minZoom: 0.8, duration: 250 })
    }, 60)
    return () => window.clearTimeout(id)
  }, [nodes.length, fitView])

  return (
    <div
      className={cn(
        "h-full w-full bg-[#f8fafc] transition-shadow",
        dragOver && "ring-2 ring-primary/50 ring-inset",
      )}
      onDragEnter={() => setDragOver(true)}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setDragOver(false)
        const type = event.dataTransfer.getData(
          "application/x-automation-step",
        ) as AutomationStepType
        if (!ADDABLE_STEPS.includes(type)) return
        onDropStep(
          type,
          screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        )
      }}
    >
      <ReactFlow
        nodes={flowNodes}
        onNodesChange={onNodesChange}
        edges={visualEdges}
        nodeTypes={{ automation: AutomationCanvasNode }}
        onNodeClick={(_, node) => {
          setSelectedEdgeId(null)
          const cid = (node.data as AutomationCanvasData).cid
          if (cid) onSelect(cid)
        }}
        onEdgeClick={(_, edge) => {
          setSelectedEdgeId(edge.id)
          onClearStepSelection()
        }}
        onPaneClick={() => setSelectedEdgeId(null)}
        onConnect={(connection) => {
          if (!connection.source || !connection.target) return
          if (connection.source === connection.target) return
          const base = savedEdges.length
            ? savedEdges
            : derivedEdges.map((edge) => ({
                source_step_id: edge.source === "trigger" ? null : edge.source,
                source_port: edge.sourceHandle ?? "default",
                target_step_id: edge.target,
              }))
          onConnect(
            {
              source_step_id:
                connection.source === "trigger" ? null : connection.source,
              source_port: connection.sourceHandle ?? "default",
              target_step_id: connection.target,
            },
            base,
          )
        }}
        onNodeDragStart={() => setDraggingNode(true)}
        onNodeDragStop={(_, node) => {
          setDraggingNode(false)
          if (node.id === "trigger") {
            onTriggerPositionChange(node.position.x, node.position.y)
          } else {
            onPositionChange(node.id, node.position.x, node.position.y)
          }
        }}
        connectionLineStyle={{ stroke: "#8b5cf6", strokeWidth: 2, strokeDasharray: "6 4" }}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.8, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
        className="h-full w-full"
      >
        <Background gap={20} size={1.2} color="#cbd5e1" />
        <Panel position="top-right" className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => void zoomOut()}>
            −
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fitView({ padding: 0.2, minZoom: 0.8 })}
            className="border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            {t("canvas.fit")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void zoomIn()}
            className="border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            +
          </Button>
        </Panel>
        <Panel
          position="bottom-left"
          className="rounded-md border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-500"
        >
          {t("canvas.dropHint")}
        </Panel>
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => {
            const data = node.data as AutomationCanvasData | undefined
            if (data?.type) return STEP_COLOR[data.type]
            return data?.kind === "trigger" ? "#10b981" : "#94a3b8"
          }}
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
          maskColor="rgba(248,250,252,0.72)"
          className="!border-slate-200 !bg-white !rounded-xl !border !shadow-sm"
        />
      </ReactFlow>
    </div>
  )
}

// ------------------------------------------------------------
// Trigger card
// ------------------------------------------------------------

function TriggerCard({
  type,
  config,
  onTypeChange,
  onConfigChange,
  t,
}: {
  type: AutomationTriggerType
  config: Record<string, unknown>
  onTypeChange: (t: AutomationTriggerType) => void
  onConfigChange: (c: Record<string, unknown>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [open, setOpen] = useState(false)
  return (
    // Card width: full on mobile, fixed 320px on sm+. The canvas wrapper
    // (max-w-2xl + px-4) keeps this tidy on tablet/desktop.
    <div className="z-10 w-full max-w-[320px] sm:w-80">
      <div className="rounded-lg border border-border border-l-4 border-l-blue-500 bg-card shadow-lg">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10 text-blue-400">
            <Zap className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-blue-300">{t("trigger")}</div>
            <div className="truncate text-sm font-medium text-foreground">
              {t(`triggers.${type}.label`)}
            </div>
          </div>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
        {open && (
          <div className="space-y-3 border-t border-border px-4 py-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("triggerType")}
              </label>
              <select
                value={type}
                onChange={(e) => onTypeChange(e.target.value as AutomationTriggerType)}
                className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(`triggers.${o.value}.label`)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t(`triggers.${type}.hint`)}
              </p>
            </div>
            {type === "keyword_match" && (
              <KeywordMatchConfig
                config={config as unknown as KeywordMatchTriggerConfig}
                onChange={onConfigChange}
                t={t}
              />
            )}
            {type === "interactive_reply" && (
              <InteractiveReplyConfig config={config} onChange={onConfigChange} t={t} />
            )}
            {type === "tag_added" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("config.tagLabel")}
                </label>
                <TagSelect
                  value={(config.tag_id as string) ?? ""}
                  onChange={(v) => onConfigChange({ ...config, tag_id: v })}
                  t={t}
                />
              </div>
            )}
            {type === "time_based" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("schedule")}
                </label>
                <Input
                  placeholder={t("schedulePlaceholder")}
                  value={(config.schedule as string) ?? ""}
                  onChange={(e) =>
                    onConfigChange({ ...config, schedule: e.target.value })
                  }
                  className="bg-muted text-foreground"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("scheduleHint")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KeywordMatchConfig({
  config,
  onChange,
  t,
}: {
  config: KeywordMatchTriggerConfig
  onChange: (c: Record<string, unknown>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const keywords = config?.keywords ?? []
  // Keep a local draft string so the comma and trailing space aren't
  // stripped on every keystroke (which made multi-word, comma-separated
  // entry like "SEO, search engine optimization" impossible to type).
  // We only parse into the keywords array on blur, then re-display the
  // cleaned, rejoined form. Seeded once on mount; this component remounts
  // when the trigger type changes, so the seed stays in sync.
  const [draft, setDraft] = useState(keywords.join(", "))

  // Persist the default the <select> displays. The dropdown falls back to
  // "contains" for display, but leaving it untouched would otherwise omit
  // match_type from the saved config — and activation validation then
  // rejected it (trigger.match_type). Seed once on mount; the component
  // remounts when the trigger type changes, matching the keywords draft.
  useEffect(() => {
    if (config?.match_type == null) {
      onChange({ ...config, match_type: "contains" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function commit() {
    const parsed = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    setDraft(parsed.join(", "))
    onChange({ ...config, keywords: parsed })
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("keywords")}
        </label>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            }
          }}
          placeholder={t("keywordsHint")}
          className="bg-muted text-foreground"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("config.matchType")}
        </label>
        <select
          value={config?.match_type ?? "contains"}
          onChange={(e) =>
            onChange({
              ...config,
              match_type: e.target.value as "exact" | "contains" | "word",
            })
          }
          className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:outline-none"
        >
          <option value="contains">{t("config.matchContains")}</option>
          <option value="word">{t("config.matchWord")}</option>
          <option value="exact">{t("config.matchExact")}</option>
        </select>
        {/* Only worth explaining for `word` — "contains" and "exact" read
            for themselves, and this is the one that changes which messages
            fire an automation in a way that isn't obvious. */}
        {config?.match_type === "word" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("config.matchWordHint")}
          </p>
        )}
      </div>
    </div>
  )
}

function InteractiveReplyConfig({
  config,
  onChange,
  t,
}: {
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const ids = (config?.reply_ids as string[] | undefined) ?? []
  // Same local-draft-then-commit pattern as KeywordMatchConfig so
  // commas + spaces survive keystrokes.
  const [draft, setDraft] = useState(ids.join(", "))

  function commit() {
    const parsed = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    setDraft(parsed.join(", "))
    onChange({ ...config, reply_ids: parsed })
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {t("replyIds")}
      </label>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          }
        }}
        placeholder={t("replyIdsHint")}
        className="bg-muted font-mono text-foreground"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{t("replyIdsHelp")}</p>
    </div>
  )
}

// ------------------------------------------------------------
// Step list + card + connectors
// ------------------------------------------------------------

interface StepListProps {
  steps: BuilderStep[]
  /**
   * Path of the step that owns this list — `[]` for the root canvas,
   * the condition's own path for a branch column. Combined with
   * `scope` by `childPath` to address each child.
   */
  basePath: StepPath
  /** Which bucket this list reads and writes. */
  scope: ParentScope
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  updateStep: (path: StepPath, updater: (s: BuilderStep) => BuilderStep) => void
  addStepAt: (parent: ParentScope, index: number, type: AutomationStepType) => void
  deleteStepAt: (path: StepPath) => void
  moveStepAt: (path: StepPath, direction: -1 | 1) => void
}

function StepList(props: StepListProps) {
  const { steps, basePath, scope, ...rest } = props

  return (
    <div className="flex w-full flex-col items-center">
      <AddButton onPick={(t) => props.addStepAt(scope, 0, t)} />
      {steps.map((step, idx) => (
        <StepRenderer
          key={step.cid}
          step={step}
          index={idx}
          total={steps.length}
          basePath={basePath}
          scope={scope}
          {...rest}
        />
      ))}
    </div>
  )
}

function StepRenderer({
  step,
  index,
  total,
  scope,
  basePath,
  ...props
}: {
  step: BuilderStep
  index: number
  total: number
  scope: ParentScope
  basePath: StepPath
} & Omit<StepListProps, "steps" | "basePath" | "scope">) {
  const t = useTranslations("Automations.builder")
  const path = childPath(basePath, scope, index)
  const meta = STEP_META[step.step_type]
  const Icon = meta.icon
  const expanded = props.expandedId === step.cid
  const isCondition = step.step_type === "condition" || step.step_type === "ab_split"
  const nested = basePath.length > 0
  // Card widths on mobile fill the full canvas column (max-w-2xl px-4
  // still keeps them reasonable). On sm+ fixed widths come back so the
  // flow visual stays recognisable — but only at the top level: a
  // branch column is a fraction of its condition's width, so a 320px
  // card inside one overflowed its own column and dragged the editor's
  // controls out of reach (issue #474). Nested cards fill the column
  // they were given instead.
  //
  // A condition is wider than a plain step because it has to hold two
  // branch columns side by side; 600px (the canvas is max-w-2xl, i.e.
  // 640px of content) leaves each branch ~294px — near enough to the
  // 320px a step gets at the top level for the same editors to fit.
  const width = nested
    ? "w-full"
    : isCondition
      ? "w-full max-w-[600px] sm:w-[600px]"
      : "w-full max-w-[320px] sm:w-80"

  return (
    <>
      <div className={cn("z-10 flex min-w-0 flex-col", width)}>
        <div
          className={cn(
            "rounded-lg border border-border border-l-4 bg-card shadow-lg",
            meta.border,
          )}
        >
          <button
            type="button"
            onClick={() => props.setExpandedId(expanded ? null : step.cid)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {isCondition ? t("kindCondition") : step.step_type === "wait" ? t("kindWait") : t("kindAction")}
              </div>
              <div className="truncate text-sm font-medium text-foreground">{t(`steps.${meta.label}`)}</div>
              <div className="truncate text-[11px] text-muted-foreground">{previewFor(step, t)}</div>
            </div>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
            />
          </button>
          {expanded && (
            <div className="border-t border-border px-4 py-3 xl:hidden">
              <StepEditor
                step={step}
                onChange={(next) => props.updateStep(path, () => next)}
              />
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    aria-label={t("moveUp")}
                    onClick={() => props.moveStepAt(path, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === total - 1}
                    aria-label={t("moveDown")}
                    onClick={() => props.moveStepAt(path, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => props.deleteStepAt(path)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("delete")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {isCondition && (
          <ConditionBranches step={step} path={path} {...props} />
        )}
      </div>

      {/* A condition branches into Yes/No (rendered above by
          ConditionBranches), so it has no linear "continue" path — adding
          the trailing connector here would produce a spurious third output. */}
      {!isCondition && (
        <AddButton onPick={(t) => props.addStepAt(scope, index + 1, t)} />
      )}
    </>
  )
}

function ConditionBranches({
  step,
  path,
  ...props
}: {
  step: BuilderStep
  /** The condition's OWN path. Children hang off it, one marker each. */
  path: StepPath
} & Omit<StepListProps, "steps" | "basePath" | "scope">) {
  const t = useTranslations("Automations.builder")
  const yes = step.branches?.yes ?? []
  const no = step.branches?.no ?? []
  return (
    // Stack Yes/No vertically until THIS CARD is wide enough for two
    // columns. A viewport breakpoint can't tell: a condition nested in
    // a branch is a fraction of the screen, and `sm:grid-cols-2` split
    // it anyway, leaving two columns too narrow to render a step in.
    <div className="@container mt-3 w-full">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <BranchColumn label={t("branches.yes")} color="text-primary">
          <StepList
            {...props}
            steps={yes}
            basePath={path}
            scope={{ kind: "branch", parentCid: step.cid, branch: "yes" }}
          />
        </BranchColumn>
        <BranchColumn label={t("branches.no")} color="text-rose-400">
          <StepList
            {...props}
            steps={no}
            basePath={path}
            scope={{ kind: "branch", parentCid: step.cid, branch: "no" }}
          />
        </BranchColumn>
      </div>
    </div>
  )
}

function BranchColumn({
  label,
  color,
  children,
}: {
  label: string
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className={cn("mb-2 text-[11px] font-semibold uppercase", color)}>{label}</div>
      {children}
    </div>
  )
}

function AddButton({ onPick }: { onPick: (t: AutomationStepType) => void }) {
  const t = useTranslations("Automations.builder")
  return (
    <div className="relative flex flex-col items-center">
      <div className="h-4 w-[2px] bg-border" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary data-[popup-open]:border-primary data-[popup-open]:bg-primary/20 data-[popup-open]:text-primary"
          aria-label={t("addStep")}
        >
          <Plus className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 min-w-56 overflow-y-auto border-border bg-popover"
        >
          {ADDABLE_STEPS.map((tp) => {
            const Icon = STEP_META[tp].icon
            return (
              <DropdownMenuItem key={tp} onClick={() => onPick(tp)}>
                <Icon className="h-4 w-4" />
                {t(`steps.${STEP_META[tp].label}`)}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="h-4 w-[2px] bg-border" aria-hidden />
    </div>
  )
}

// ------------------------------------------------------------
// Per-step config editor
// ------------------------------------------------------------

function ConditionEditor({
  step,
  onChange,
}: {
  step: BuilderStep
  onChange: (s: BuilderStep) => void
}) {
  const t = useTranslations("Automations.builder")
  const cfg = step.step_config
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...step, step_config: editConditionConfig(cfg, patch, browserTimeZone()) })
  const subject = (cfg.subject as string) ?? "tag_presence"
  const timezone = (cfg.timezone as string | undefined) ?? LEGACY_CONDITION_TIMEZONE

  return (
    <>
      <FieldBlock label={t("config.subjectLabel")}>
        <select
          value={subject}
          onChange={(e) => set({ subject: e.target.value })}
          className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
        >
          <option value="tag_presence">{t("config.subjects.tag_presence")}</option>
          <option value="contact_field">{t("config.subjects.contact_field")}</option>
          <option value="message_content">{t("config.subjects.message_content")}</option>
          <option value="time_of_day">{t("config.subjects.time_of_day")}</option>
        </select>
      </FieldBlock>
      {subject !== "message_content" && (
        <FieldBlock label={t("config.operandLabel")}>
          <Input
            placeholder={
              subject === "time_of_day"
                ? t("config.placeholderTime")
                : subject === "contact_field"
                ? t("config.placeholderContact")
                : subject === "tag_presence"
                ? t("config.placeholderTag")
                : ""
            }
            value={(cfg.operand as string) ?? ""}
            onChange={(e) => set({ operand: e.target.value })}
            className="bg-muted text-foreground"
          />
        </FieldBlock>
      )}
      {subject === "time_of_day" && (
        <FieldBlock label={t("config.timezoneLabel")}>
          <Select value={timezone} onValueChange={(v) => v && set({ timezone: v })}>
            <SelectTrigger className="w-full bg-muted text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {listTimeZones(timezone).map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>
      )}
      {(subject === "contact_field" || subject === "message_content") && (
        <FieldBlock label={t("config.valueLabel")}>
          <Input
            value={(cfg.value as string) ?? ""}
            onChange={(e) => set({ value: e.target.value })}
            className="bg-muted text-foreground"
          />
        </FieldBlock>
      )}
    </>
  )
}


function StepEditor({
  step,
  onChange,
}: {
  step: BuilderStep
  onChange: (s: BuilderStep) => void
}) {
  const t = useTranslations("Automations.builder")
  const cfg = step.step_config
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...step, step_config: { ...cfg, ...patch } })

  switch (step.step_type) {
    case "send_message":
      return (
        <FieldBlock label={t("config.messageText")}>
          <Textarea
            value={(cfg.text as string) ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            placeholder={t("config.placeholderMessageText")}
            className="min-h-24 bg-muted text-foreground"
          />
        </FieldBlock>
      )
    case "send_buttons":
    case "send_list":
      // The whole step_config IS the interactive payload; the shared
      // builder edits it in place (and enforces Meta's limits + preview).
      // `wait_for_reply` rides on the step_config beside the payload. The
      // composer rebuilds the payload from scratch when switching between
      // buttons and list, so re-attach it on every change.
      return (
        <>
          <InteractiveBuilder
            value={asInteractive(cfg)}
            onChange={(payload) =>
              onChange({
                ...step,
                step_config: {
                  ...toStepConfig(payload),
                  ...(cfg.wait_for_reply ? { wait_for_reply: true } : {}),
                },
              })
            }
          />
          <label className="flex items-start gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={cfg.wait_for_reply === true}
              onChange={(e) => set({ wait_for_reply: e.target.checked })}
              className="mt-0.5 h-3.5 w-3.5 accent-primary"
            />
            <span>
              {t("config.waitForReply")}
              <span className="block text-muted-foreground">
                {t("config.waitForReplyHint")}
              </span>
            </span>
          </label>
        </>
      )
    case "send_template":
      return (
        <SendTemplateFields
          templateName={(cfg.template_name as string) ?? ""}
          language={(cfg.language as string) ?? ""}
          onChange={(patch) => set(patch)}
          t={t}
        />
      )
    case "add_tag":
    case "remove_tag":
      return (
        <FieldBlock label={t("config.tagLabel")}>
          <TagSelect
            value={(cfg.tag_id as string) ?? ""}
            onChange={(v) => set({ tag_id: v })}
            t={t}
          />
        </FieldBlock>
      )
    case "assign_conversation":
      return (
        <>
          <FieldBlock label={t("config.modeLabel")}>
            <select
              value={(cfg.mode as string) ?? "round_robin"}
              onChange={(e) => set({ mode: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
            >
              <option value="round_robin">{t("config.modes.round_robin")}</option>
              <option value="specific">{t("config.modes.specific")}</option>
            </select>
          </FieldBlock>
          {cfg.mode === "specific" && (
            <FieldBlock label={t("config.agentLabel")}>
              <AgentSelect
                value={(cfg.agent_id as string) ?? ""}
                onChange={(v) => set({ agent_id: v })}
                t={t}
              />
            </FieldBlock>
          )}
        </>
      )
    case "update_contact_field":
      return (
        <>
          <FieldBlock label={t("config.fieldLabel")}>
            <ContactFieldSelect
              value={(cfg.field as string) ?? "name"}
              onChange={(v) => set({ field: v })}
              t={t}
            />
          </FieldBlock>
          <FieldBlock label={t("config.valueLabel")}>
            <Input
              value={(cfg.value as string) ?? ""}
              onChange={(e) => set({ value: e.target.value })}
              placeholder={t.raw("config.placeholderValue")}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
        </>
      )
    case "create_deal":
      return (
        <>
          <DealPipelineFields
            pipelineId={(cfg.pipeline_id as string) ?? ""}
            stageId={(cfg.stage_id as string) ?? ""}
            onChange={(patch) => set(patch)}
            t={t}
          />
          <FieldBlock label={t("config.titleLabel")}>
            <Input
              value={(cfg.title as string) ?? ""}
              onChange={(e) => set({ title: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.valueLabel")}>
            <Input
              type="number"
              value={(cfg.value as number) ?? 0}
              onChange={(e) => set({ value: Number(e.target.value) })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
        </>
      )
    case "wait":
      return (
        <div className="grid grid-cols-2 gap-2">
          <FieldBlock label={t("config.amountLabel")}>
            <Input
              type="number"
              min={1}
              value={(cfg.amount as number) ?? 1}
              onChange={(e) => set({ amount: Math.max(1, Number(e.target.value)) })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.unitLabel")}>
            <select
              value={(cfg.unit as string) ?? "hours"}
              onChange={(e) => set({ unit: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
            >
              <option value="minutes">{t("config.units.minutes")}</option>
              <option value="hours">{t("config.units.hours")}</option>
              <option value="days">{t("config.units.days")}</option>
            </select>
          </FieldBlock>
        </div>
      )
    case "condition":
      return <ConditionEditor step={step} onChange={onChange} />
    case "ab_split":
      return (
        <p className="text-xs text-muted-foreground">
          {t("config.abSplitHint")}
        </p>
      )
    case "ask_data":
      return (
        <>
          <FieldBlock label={t("config.askMessage")}>
            <Textarea
              value={(cfg.message as string) ?? ""}
              onChange={(e) => set({ message: e.target.value })}
              className="min-h-16 bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.askField")}>
            <ContactFieldSelect
              value={(cfg.field as string) ?? "name"}
              onChange={(field) => set({ field })}
              t={t}
            />
          </FieldBlock>
        </>
      )
    case "send_flow":
      return (
        <>
          <FieldBlock label={t("config.flowId")}>
            <FlowIdInput
              value={(cfg.flow_id as string) ?? ""}
              onChange={(flow_id) => set({ flow_id })}
              t={t}
            />
          </FieldBlock>
          <FieldBlock label={t("config.flowScreen")}>
            <Input
              value={(cfg.screen as string) ?? ""}
              onChange={(e) => set({ screen: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.flowAction")}>
            <select
              value={(cfg.action as string) ?? "navigate"}
              onChange={(e) => set({ action: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="navigate">{t("config.flowActionNavigate")}</option>
              <option value="data_exchange">{t("config.flowActionDataExchange")}</option>
            </select>
          </FieldBlock>
          <FieldBlock label={t("config.flowBody")}>
            <Textarea
              value={(cfg.body as string) ?? ""}
              onChange={(e) => set({ body: e.target.value })}
              className="min-h-16 bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.flowCta")}>
            <Input
              value={(cfg.cta as string) ?? ""}
              onChange={(e) => set({ cta: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.flowSaveField")}>
            <ContactFieldSelect
              value={(cfg.field as string) ?? ""}
              onChange={(field) => set({ field })}
              t={t}
              allowEmpty
            />
          </FieldBlock>
        </>
      )
    case "ask_location":
      return (
        <>
          <FieldBlock label={t("config.locationMessage")}>
            <Textarea
              value={(cfg.message as string) ?? ""}
              onChange={(e) => set({ message: e.target.value })}
              className="min-h-16 bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.locationField")}>
            <ContactFieldSelect
              value={(cfg.field as string) ?? "name"}
              onChange={(field) => set({ field })}
              t={t}
            />
          </FieldBlock>
        </>
      )
    case "handoff":
      return (
        <>
          <FieldBlock label={t("config.handoffMessage")}>
            <Textarea
              value={(cfg.message as string) ?? ""}
              onChange={(e) => set({ message: e.target.value })}
              className="min-h-16 bg-muted text-foreground"
            />
          </FieldBlock>
          <p className="text-[11px] text-muted-foreground">
            {t("config.handoffHint")}
          </p>
        </>
      )
    case "send_webhook":
      return (
        <>
          <FieldBlock label={t("config.urlLabel")}>
            <Input
              value={(cfg.url as string) ?? ""}
              onChange={(e) => set({ url: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.bodyTemplateLabel")}>
            <Textarea
              value={(cfg.body_template as string) ?? ""}
              onChange={(e) => set({ body_template: e.target.value })}
              className="min-h-20 bg-muted font-mono text-xs text-foreground"
            />
          </FieldBlock>
        </>
      )
    case "close_conversation":
      return (
        <p className="text-xs text-muted-foreground">
          {t("config.closeConversationHint", { defaultValue: "Sets the conversation status to \"closed\". No configuration needed." })}
        </p>
      )
    default:
      return null
  }
}

function FieldBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-2 last:mb-0">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function previewFor(
  step: BuilderStep,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (step.step_type) {
    case "send_message":
      return (step.step_config.text as string) || t("preview.noText")
    case "send_buttons":
    case "send_list": {
      const preview =
        interactivePayloadPreviewText(asInteractive(step.step_config)) || t("preview.noBody")
      return step.step_config.wait_for_reply
        ? t("preview.withWaitForReply", { preview })
        : preview
    }
    case "send_template":
      return (step.step_config.template_name as string) || t("preview.pickTemplate")
    case "wait": {
      const unit = (step.step_config.unit as string | undefined) ?? ""
      const unitLabel =
        unit === "minutes" || unit === "hours" || unit === "days"
          ? t(`preview.units.${unit}`)
          : unit
      return t("preview.wait", {
        amount: String(step.step_config.amount ?? "?"),
        unit: unitLabel,
      })
    }
    case "condition":
      return t("preview.when", { subject: String(step.step_config.subject ?? "?") })
    case "ab_split":
      return t("preview.abSplit")
    case "ask_data":
      return t("preview.askData")
    case "send_flow":
      return t("preview.sendFlow")
    case "ask_location":
      return t("preview.askLocation")
    case "handoff":
      return t("preview.handoff")
    case "send_webhook":
      return (step.step_config.url as string) || t("preview.noUrl")
    default:
      return ""
  }
}

// ------------------------------------------------------------
// Serialize builder tree → API payload (flattened shape)
// ------------------------------------------------------------

interface ApiStep {
  id?: string
  step_type: string
  step_config: Record<string, unknown>
  position_x?: number | null
  position_y?: number | null
  branches?: { yes?: ApiStep[]; no?: ApiStep[] }
}

export function toApiSteps(steps: BuilderStep[]): ApiStep[] {
  return steps.map((s) => ({
    ...(s.id ? { id: s.id } : {}),
    step_type: s.step_type,
    step_config: s.step_config,
    position_x: s.position_x ?? null,
    position_y: s.position_y ?? null,
    branches: s.branches
      ? { yes: toApiSteps(s.branches.yes), no: toApiSteps(s.branches.no) }
      : undefined,
  }))
}

/**
 * Convert server-returned step tree (from loadStepsTree) into the
 * builder-local shape with client ids.
 */
export interface ServerStepNode {
  id: string
  step_type: string
  step_config: Record<string, unknown>
  branches: { yes: ServerStepNode[]; no: ServerStepNode[] }
}

export function fromServerSteps(nodes: ServerStepNode[]): BuilderStep[] {
  return nodes.map((n) => ({
    cid: cid(),
    id: n.id,
    step_type: n.step_type as AutomationStepType,
    step_config: n.step_config ?? {},
    branches:
      n.step_type === "condition"
        ? {
            yes: fromServerSteps(n.branches?.yes ?? []),
            no: fromServerSteps(n.branches?.no ?? []),
          }
        : undefined,
  }))
}
