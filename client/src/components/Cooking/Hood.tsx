import React, { useState, memo } from 'react';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type StepEvent = {
  type: string;
  payload: Record<string, any>;
};

type HoodProps = {
  message: TMessage;
  isSubmitting?: boolean;
};

type CookingStatusKey =
  | 'com_cooking_status_checking_recipe'
  | 'com_cooking_status_choosing_approach'
  | 'com_cooking_status_planning'
  | 'com_cooking_status_thinking'
  | 'com_cooking_status_updating_canvas'
  | 'com_cooking_status_verifying';

function getStepTitle(type: string, payload: Record<string, any>) {
  switch (type) {
    case 'turn_start':
      return 'Turn Started';
    case 'web_context_loaded':
      return 'Web Context Loaded';
    case 'planner_request':
      return 'Planning Requested';
    case 'planner_result':
      return 'Plan Formulated';
    case 'model_routing':
      return 'Model Routing Decision';
    case 'tool_call_received':
      return 'Tool Call Initiated';
    case 'tool_result':
      return payload.ok === false ? 'Tool Execution Failed' : 'Tool Executed Successfully';
    case 'quality_start':
      return 'Quality Validation Started';
    case 'quality_repair_start':
      return 'Quality Repair Started';
    case 'quality_repair_succeeded':
      return 'Quality Repair Succeeded';
    case 'quality_repair_failed':
      return 'Quality Repair Failed';
    case 'quality_sanitization_attempt':
      return 'Sanitization Triggered';
    case 'quality_sanitization_succeeded':
      return 'Sanitization Succeeded';
    case 'quality_result':
      return payload.ok ? 'Quality Gate Passed' : 'Quality Gate Warning';
    case 'turn_complete':
      return 'Turn Completed';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function getStepSummary(type: string, payload: Record<string, any>): string {
  switch (type) {
    case 'turn_start':
      return `Received prompt of ${payload.textChars} chars. Active canvas: ${payload.hasActiveDraft ? 'yes' : 'no'}.`;
    case 'web_context_loaded':
      return `Configured ${payload.configuredToolCount} web tools. Status: ${payload.unavailableReason || 'available'}.`;
    case 'planner_request':
      return `Invoked planner model ${payload.plannerModel || 'primary'}.`;
    case 'planner_result':
      return `Intent: "${payload.intent}", Action: "${payload.action}". Conf: ${payload.confidence}.`;
    case 'model_routing':
      return `Response Model: "${payload.responseModel}". Purpose: ${payload.responsePurpose}.`;
    case 'tool_call_received':
      return `Calling tool "${payload.toolName}" (turn ${payload.turn}).`;
    case 'tool_result':
      if (payload.ok === false) {
        return `Failed executing ${payload.toolName}: ${payload.error || 'Unknown error'}`;
      }
      return `Tool "${payload.toolName}" finished in ${payload.durationMs}ms. Canvas updated: ${payload.draftChanged ? 'yes' : 'no'}.`;
    case 'quality_start':
      return `Evaluating response of ${payload.responseChars} chars. Primary model: ${payload.model}.`;
    case 'quality_result':
      return payload.ok
        ? 'Response verified against safety & profile constraints.'
        : `Validation warnings: ${payload.failureLabels?.join(', ') || 'failed'}`;
    case 'quality_repair_start':
      return `Attempting repair for issues: ${payload.failureLabels?.join(', ')}. Model: ${payload.repairModel}.`;
    case 'quality_repair_succeeded':
      return 'Quality issues resolved successfully.';
    case 'quality_repair_failed':
      return 'Failed to repair quality violations.';
    case 'quality_sanitization_attempt':
      return `Sanitizing issues: ${payload.failureLabels?.join(', ')}.`;
    case 'quality_sanitization_succeeded':
      return 'Restricted disclosures or private contexts stripped.';
    case 'turn_complete':
      return `Response completed in ${(payload.totalMs / 1000).toFixed(2)}s. Output size: ${payload.outputChars} chars.`;
    default:
      return '';
  }
}

const StepRow = memo(function StepRow({ step }: { step: StepEvent }) {
  const [expanded, setExpanded] = useState(false);
  const title = getStepTitle(step.type, step.payload);
  const summary = getStepSummary(step.type, step.payload);

  const cleanPayload = { ...step.payload };
  delete cleanPayload.conversationId;

  const hasDetails = Object.keys(cleanPayload).length > 0;

  return (
    <div className="relative flex gap-x-2 pb-1.5 text-left text-[11px] leading-relaxed">
      {/* Bullet Dot */}
      <div className="flex flex-shrink-0 items-start pt-1.5">
        <div className="bg-text-secondary/35 dark:bg-text-secondary-dark/35 h-1.5 w-1.5 rounded-full" />
      </div>

      {/* Step Content */}
      <div className="flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="dark:text-text-primary-dark font-semibold text-text-primary">
            {title}
          </span>
          {summary && (
            <span className="dark:text-text-secondary-dark font-normal text-text-secondary">
              — {summary}
            </span>
          )}
          {hasDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-text-secondary/70 ml-1 inline-flex items-center text-[9px] font-normal underline decoration-dotted transition-colors hover:text-text-primary focus:outline-none"
            >
              {expanded ? 'hide details' : 'details'}
            </button>
          )}
        </div>

        {/* Nested Collapsible Details */}
        {expanded && hasDetails && (
          <div className="border-border-light/30 dark:border-border-medium/15 bg-surface-tertiary/30 dark:bg-surface-secondary/15 mt-1 max-w-full overflow-x-auto rounded border p-1.5 font-mono text-[9px] text-text-secondary">
            <pre className="whitespace-pre-wrap break-all leading-normal">
              {JSON.stringify(cleanPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
});

function statusKeyForSteps(steps: StepEvent[]): CookingStatusKey {
  const latestType = steps[steps.length - 1]?.type ?? '';
  if (latestType.startsWith('quality_')) {
    return 'com_cooking_status_verifying';
  }
  if (latestType === 'web_context_loaded' || latestType === 'read_source') {
    return 'com_cooking_status_checking_recipe';
  }
  if (latestType.startsWith('planner_') || latestType === 'model_routing') {
    return 'com_cooking_status_choosing_approach';
  }
  if (latestType.startsWith('tool_')) {
    return 'com_cooking_status_updating_canvas';
  }
  if (latestType === 'turn_start') {
    return 'com_cooking_status_planning';
  }
  return 'com_cooking_status_thinking';
}

function Hood({ message, isSubmitting }: HoodProps) {
  const [open, setOpen] = useState(false);
  const steps = useRecoilValue(store.stepsByMessageId(message.messageId)) || [];
  const localize = useLocalize();

  if (message.isCreatedByUser || steps.length === 0) {
    return null;
  }

  const label = isSubmitting
    ? localize(statusKeyForSteps(steps))
    : localize('com_cooking_look_under_hood');

  return (
    <div className="mb-2 flex max-w-xl flex-col self-start">
      <button
        onClick={() => setOpen(!open)}
        className="text-text-secondary/70 flex items-center gap-1 px-0 py-0.5 text-[11px] font-medium transition-colors hover:text-text-primary focus:outline-none"
      >
        <Terminal
          className={`text-text-secondary/60 h-3 w-3 transition-colors ${isSubmitting ? 'animate-pulse text-text-primary' : ''}`}
        />
        <span>{label}</span>
        <span className="font-normal opacity-60">
          ({localize('com_cooking_step_count', { 0: steps.length })})
        </span>
        {open ? (
          <ChevronUp className="h-3 w-3 opacity-60" />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-60" />
        )}
      </button>

      {open && (
        <div className="border-border-light/80 dark:border-border-medium/40 animate-slide-down mt-1.5 max-w-lg border-l pl-3 transition-all">
          <div className="relative space-y-0.5">
            {steps.map((step, idx) => (
              <StepRow key={`${step.type}-${idx}`} step={step} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(Hood);
