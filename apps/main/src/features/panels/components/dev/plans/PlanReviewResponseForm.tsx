import { Button, DisclosureSection } from '@pixsim7/shared.ui';

export type ReviewResponseNodeKind = 'review_comment' | 'agent_response' | 'conclusion' | 'note';
export type ReviewResponseAuthorRole = 'reviewer' | 'author' | 'agent' | 'system';
export type ReviewResponseSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type ReviewResponseRelation = 'replies_to' | 'addresses' | 'because_of' | 'supports' | 'contradicts' | 'supersedes';

export interface ReviewResponseNodeSummary {
  id: string;
  authorRole: ReviewResponseAuthorRole;
  kind: ReviewResponseNodeKind;
}

interface PlanReviewResponseFormProps {
  inputClassName: string;
  textAreaClassName: string;
  selectedRoundStatus: string | null;
  selectedRoundNodes: ReviewResponseNodeSummary[];
  relationOptions: Array<{ value: ReviewResponseRelation; label: string }>;
  composeTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  kind: ReviewResponseNodeKind;
  authorRole: ReviewResponseAuthorRole;
  severity: ReviewResponseSeverity | '';
  body: string;
  refTargetId: string;
  refRelation: ReviewResponseRelation;
  refPlanAnchor: string;
  refQuote: string;
  creating: boolean;
  onKindChange: (value: ReviewResponseNodeKind) => void;
  onAuthorRoleChange: (value: ReviewResponseAuthorRole) => void;
  onSeverityChange: (value: ReviewResponseSeverity | '') => void;
  onBodyChange: (value: string) => void;
  onRefTargetIdChange: (value: string) => void;
  onRefRelationChange: (value: ReviewResponseRelation) => void;
  onRefPlanAnchorChange: (value: string) => void;
  onRefQuoteChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
}

export function PlanReviewResponseForm({
  inputClassName,
  textAreaClassName,
  selectedRoundStatus,
  selectedRoundNodes,
  relationOptions,
  composeTextareaRef,
  kind,
  authorRole,
  severity,
  body,
  refTargetId,
  refRelation,
  refPlanAnchor,
  refQuote,
  creating,
  onKindChange,
  onAuthorRoleChange,
  onSeverityChange,
  onBodyChange,
  onRefTargetIdChange,
  onRefRelationChange,
  onRefPlanAnchorChange,
  onRefQuoteChange,
  onSubmit,
}: PlanReviewResponseFormProps) {
  return (
    <DisclosureSection
      label="Add Response"
      defaultOpen={false}
      className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
      contentClassName="space-y-2"
    >
      {!selectedRoundStatus ? (
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Select a round before adding responses.
        </div>
      ) : (
        <>
          {selectedRoundStatus === 'concluded' && (
            <div className="text-xs text-orange-600 dark:text-orange-400">
              This round is concluded. Re-open it to continue discussion.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Kind
              <select
                value={kind}
                onChange={(e) => onKindChange(e.target.value as ReviewResponseNodeKind)}
                className={inputClassName}
              >
                <option value="review_comment">review_comment</option>
                <option value="agent_response">agent_response</option>
                <option value="note">note</option>
                <option value="conclusion">conclusion</option>
              </select>
            </label>
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Role
              <select
                value={authorRole}
                onChange={(e) => onAuthorRoleChange(e.target.value as ReviewResponseAuthorRole)}
                className={inputClassName}
              >
                <option value="reviewer">reviewer</option>
                <option value="author">author</option>
                <option value="agent">agent</option>
                <option value="system">system</option>
              </select>
            </label>
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Severity
              <select
                value={severity}
                onChange={(e) => onSeverityChange(e.target.value as ReviewResponseSeverity | '')}
                className={inputClassName}
              >
                <option value="">none</option>
                <option value="info">info</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
          </div>

          <label className="text-[11px] text-neutral-600 dark:text-neutral-400 block">
            Body
            <textarea
              ref={composeTextareaRef}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              className={textAreaClassName}
              rows={5}
              placeholder="Add review feedback, response, or conclusion details..."
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Target Node (optional)
              <select
                value={refTargetId}
                onChange={(e) => onRefTargetIdChange(e.target.value)}
                className={inputClassName}
              >
                <option value="">none</option>
                {selectedRoundNodes.map((node, idx) => (
                  <option key={node.id} value={node.id}>
                    #{idx + 1} {node.authorRole}/{node.kind} {node.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Relation
              <select
                value={refRelation}
                onChange={(e) => onRefRelationChange(e.target.value as ReviewResponseRelation)}
                className={inputClassName}
              >
                {relationOptions.map((relation) => (
                  <option key={relation.value} value={relation.value}>
                    {relation.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Plan Anchor (optional)
              <input
                value={refPlanAnchor}
                onChange={(e) => onRefPlanAnchorChange(e.target.value)}
                className={inputClassName}
                placeholder="e.g. checkpoint:cp-2"
              />
            </label>
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Quote (optional)
              <input
                value={refQuote}
                onChange={(e) => onRefQuoteChange(e.target.value)}
                className={inputClassName}
                placeholder="Short quoted context"
              />
            </label>
          </div>

          <Button
            size="sm"
            onClick={() => void onSubmit()}
            disabled={creating || selectedRoundStatus === 'concluded'}
          >
            {creating ? 'Posting...' : 'Add Response'}
          </Button>
        </>
      )}
    </DisclosureSection>
  );
}

