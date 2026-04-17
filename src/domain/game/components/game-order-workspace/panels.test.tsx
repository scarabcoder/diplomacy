import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SubmitPanel } from './panels.tsx';

describe('SubmitPanel', () => {
  it('keeps submitted phases editable until resolution', () => {
    const markup = renderToStaticMarkup(
      <SubmitPanel
        isSpectator={false}
        myPower="france"
        isSubmissionOpen
        canSubmitCurrentPhase
        submissionPreviewTitle="Orders Ready to Submit"
        summaryLines={['A Par H']}
        submissionStatus={{
          submitted: ['france'],
          pending: ['england'],
        }}
        errorMessage={null}
        hasSubmittedSubmission
        isPending={false}
        onSubmit={() => {}}
      />,
    );

    expect(markup).toContain(
      'Submitted. You can still edit and resubmit until the phase resolves.',
    );
    expect(markup).toContain('Update Submission');
    expect(markup).toContain(
      'Current submission is confirmed. Changes remain editable until the phase resolves.',
    );
  });

  it('shows the initial submit action before confirmation', () => {
    const markup = renderToStaticMarkup(
      <SubmitPanel
        isSpectator={false}
        myPower="france"
        isSubmissionOpen
        canSubmitCurrentPhase
        submissionPreviewTitle="Orders Ready to Submit"
        summaryLines={['A Par H']}
        submissionStatus={null}
        errorMessage={null}
        hasSubmittedSubmission={false}
        isPending={false}
        onSubmit={() => {}}
      />,
    );

    expect(markup).toContain('Review your draft, then submit when ready.');
    expect(markup).toContain('Submit');
    expect(markup).not.toContain('Update Submission');
  });
});
