/**
 * Simulation script showing how video_extend payloads are constructed.
 *
 * Run this in browser console or use as reference for testing.
 * This is NOT production code - it's for understanding the data flow.
 */

// ============================================================================
// Scenario 1: User has a video URL they want to extend
// ============================================================================

interface SimulateExtendWithUrl {
  // User selections in UI
  operationType: 'video_extend';
  providerId: 'pixverse';
  presetId: 'preset_cinematic';

  // User inputs
  prompt: 'Continue the action sequence with dramatic lighting';
  videoUrl: 'https://storage.example.com/user_videos/scene1.mp4';

  // Selected preset params
  presetParams: {
    quality: '1080p';
    motion_mode: 'cinematic';
  };
}

function simulateExtendWithUrl(): void {
  const scenario: SimulateExtendWithUrl = {
    operationType: 'video_extend',
    providerId: 'pixverse',
    presetId: 'preset_cinematic',
    prompt: 'Continue the action sequence with dramatic lighting',
    videoUrl: 'https://storage.example.com/user_videos/scene1.mp4',
    presetParams: {
      quality: '1080p',
      motion_mode: 'cinematic',
    },
  };

  // What QuickGenerateModule does:
  const dynamicParams = {
    video_url: scenario.videoUrl, // Captured from form input
  };

  // Parameter merging in QuickGenerateModule.onGenerate()
  // const mergedParams = { prompt: scenario.prompt, ...scenario.presetParams, ...dynamicParams }

  // Final payload sent to POST /api/v1/jobs
  const payload = {
    operation_type: scenario.operationType,
    provider_id: scenario.providerId,
    params: {
      prompt: scenario.prompt,
      preset_id: scenario.presetId,
      ...scenario.presetParams,
      ...dynamicParams,
    },
  };

  console.log('📦 Scenario 1: Extend with video_url');
  console.log('Final API Payload:', JSON.stringify(payload, null, 2));
  console.log('\n✓ Backend will download video from URL and submit to Pixverse');
}

// ============================================================================
// Scenario 2: User wants to extend a previously generated Pixverse video
// ============================================================================

interface SimulateExtendWithProviderID {
  operationType: 'video_extend';
  providerId: 'pixverse';
  presetId: 'preset_fast';

  prompt: 'Add more dramatic action';
  // This would come from a previous job's result
  originalVideoId: 'px_vid_abc123xyz789'; // Pixverse's internal video ID

  presetParams: {
    quality: '720p';
  };
}

function simulateExtendWithProviderId(): void {
  const scenario: SimulateExtendWithProviderID = {
    operationType: 'video_extend',
    providerId: 'pixverse',
    presetId: 'preset_fast',
    prompt: 'Add more dramatic action',
    originalVideoId: 'px_vid_abc123xyz789',
    presetParams: {
      quality: '720p',
    },
  };

  // What QuickGenerateModule does:
  const dynamicParams = {
    original_video_id: scenario.originalVideoId, // Captured from form input
  };

  // Parameter merging
  // const mergedParams = { prompt: scenario.prompt, ...scenario.presetParams, ...dynamicParams }

  // Final payload
  const payload = {
    operation_type: scenario.operationType,
    provider_id: scenario.providerId,
    params: {
      prompt: scenario.prompt,
      preset_id: scenario.presetId,
      ...scenario.presetParams,
      ...dynamicParams,
    },
  };

  console.log('📦 Scenario 2: Extend with original_video_id');
  console.log('Final API Payload:', JSON.stringify(payload, null, 2));
  console.log('\n✓ Backend uses Pixverse internal ID directly (no re-upload)');
  console.log('✓ This is MUCH faster and preferred for Pixverse');
}

// ============================================================================
// Scenario 3: Realistic flow - extending your own generated video
// ============================================================================

interface JobResponse {
  id: number;
  status: string;
  params: Record<string, any>;
  // ... other fields
}

function simulateRealisticExtendFlow(): void {
  console.log('🎬 Realistic Flow: Generate → Store ID → Extend\n');

  // Step 1: User generates initial video
  console.log('Step 1: Initial generation');
  const initialJob: JobResponse = {
    id: 101,
    status: 'completed',
    params: {
      prompt: 'A cat walking on a beach',
      quality: '1080p',
      aspect_ratio: '16:9',
    },
  };
  console.log('Initial job created:', initialJob.id);

  // Step 2: Backend processes and stores Pixverse's video ID
  // (This happens in the backend provider integration)
  const pixverseResponse = {
    task_id: 'px_vid_abc123xyz789', // Pixverse's internal ID
    status: 'success',
    video_url: 'https://pixverse.cdn.com/outputs/px_vid_abc123xyz789.mp4',
  };
  console.log('Pixverse returned video ID:', pixverseResponse.task_id);

  // Step 3: Backend stores this in the job results or asset record
  // (In the future, we'd add a field like `provider_video_id` to Asset or Job)
  const storedAsset = {
    id: 555,
    job_id: 101,
    provider_video_id: pixverseResponse.task_id, // Store this!
    remote_url: pixverseResponse.video_url,
  };
  console.log('Asset stored with provider_video_id:', storedAsset.provider_video_id);

  // Step 4: User wants to extend this video
  console.log('\nStep 4: User clicks "Extend" on asset 555');

  // Frontend pre-fills the form with provider_video_id
  const extendPayload = {
    operation_type: 'video_extend',
    provider_id: 'pixverse',
    params: {
      prompt: 'Continue with the cat running',
      original_video_id: storedAsset.provider_video_id, // ← Key part!
      quality: '1080p',
    },
  };

  console.log('\n📦 Extend Payload:', JSON.stringify(extendPayload, null, 2));
  console.log('\n✓ Backend can immediately submit to Pixverse without re-uploading');
  console.log('✓ Pixverse recognizes px_vid_abc123xyz789 and extends it');
}

// ============================================================================
// Scenario 4: What if operation_specs define the field?
// ============================================================================

function simulateWithOperationSpecs(): void {
  console.log('🔧 Scenario 4: Dynamic form from operation_specs\n');

  // Imagine backend returns this for Pixverse video_extend
  const operationSpecs = {
    video_extend: {
      parameters: [
        {
          name: 'prompt',
          type: 'string',
          required: false,
          description: 'Optional prompt to guide the extension',
        },
        {
          name: 'video_url',
          type: 'string',
          required: false,
          description: 'External video URL to extend',
        },
        {
          name: 'original_video_id',
          type: 'string',
          required: false,
          description: 'Pixverse internal video ID (preferred)',
        },
        {
          name: 'quality',
          type: 'string',
          enum: ['360p', '720p', '1080p'],
          default: '720p',
          group: 'render',
        },
        {
          name: 'extend_duration',
          type: 'number',
          required: false,
          min: 1,
          max: 10,
          default: 4,
          description: 'Seconds to extend',
          group: 'core',
        },
      ],
    },
  };

  console.log('Operation specs received from backend:', JSON.stringify(operationSpecs, null, 2));

  // DynamicParamForm renders:
  // - Core group: extend_duration (number input, default 4)
  // - Render group: quality (select with enum options)
  // - Other: video_url (text input), original_video_id (text input), prompt (handled separately)

  console.log('\n📋 DynamicParamForm would render:');
  console.log('  [Core Settings]');
  console.log('    • extend_duration: <input type="number" min="1" max="10" value="4" />');
  console.log('  [Render Settings]');
  console.log('    • quality: <select><option>360p</option><option>720p</option><option>1080p</option></select>');
  console.log('  [Other]');
  console.log('    • video_url: <input type="text" placeholder="External video URL" />');
  console.log('    • original_video_id: <input type="text" placeholder="Pixverse internal ID" />');

  // User fills in:
  const userInput = {
    original_video_id: 'px_vid_xyz789',
    extend_duration: 5,
    quality: '1080p',
  };

  const finalParams = {
    prompt: 'Continue the scene',
    ...userInput,
  };

  console.log('\n📦 Final params sent to API:', JSON.stringify(finalParams, null, 2));
}

// ============================================================================
// Run all simulations
// ============================================================================

export function runAllExtendSimulations(): void {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  VIDEO EXTEND PAYLOAD SIMULATIONS');
  console.log('═══════════════════════════════════════════════════════════\n');

  simulateExtendWithUrl();
  console.log('\n' + '─'.repeat(60) + '\n');

  simulateExtendWithProviderId();
  console.log('\n' + '─'.repeat(60) + '\n');

  simulateRealisticExtendFlow();
  console.log('\n' + '─'.repeat(60) + '\n');

  simulateWithOperationSpecs();
  console.log('\n' + '═'.repeat(60));
  console.log('💡 To use in browser console:');
  console.log('   import { runAllExtendSimulations } from "./lib/api/__simulate_extend"');
  console.log('   runAllExtendSimulations()');
  console.log('═'.repeat(60));
}

// For direct execution in dev environment
if (typeof window !== 'undefined') {
  (window as any).simulateVideoExtend = runAllExtendSimulations;
  console.log('💡 Simulation loaded! Run: simulateVideoExtend()');
}
