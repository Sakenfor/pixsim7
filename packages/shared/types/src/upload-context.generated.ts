// Auto-generated from upload-context.yaml - DO NOT EDIT
// Re-run: pnpm upload-context:gen

export type UploadContextFieldType = 'string' | 'number' | 'boolean';

export interface UploadContextFieldSpec {
  type: UploadContextFieldType;
  label?: string;
  description?: string;
  filterable?: boolean;
}

export interface UploadContextMethodSpec {
  label?: string;
  fields: Record<string, UploadContextFieldSpec>;
}

export interface UploadContextSpec {
  version: number;
  common?: {
    fields: Record<string, UploadContextFieldSpec>;
  };
  upload_methods: Record<string, UploadContextMethodSpec>;
}

export const uploadContextSpec: UploadContextSpec = {
  "version": 1,
  "common": {
    "fields": {
      "client": {
        "type": "string",
        "label": "Client",
        "description": "Source client identifier (e.g., chrome_extension)"
      },
      "feature": {
        "type": "string",
        "label": "Feature",
        "description": "Feature or flow that initiated the upload"
      },
      "source": {
        "type": "string",
        "label": "Source",
        "description": "Sub-source or tool identifier (e.g., video_player)"
      },
      "version_parent_id": {
        "type": "number",
        "label": "Version Parent",
        "description": "Asset ID to version from (chains new upload as next version)"
      },
      "version_message": {
        "type": "string",
        "label": "Version Message",
        "description": "What changed in this version"
      }
    }
  },
  "upload_methods": {
    "web": {
      "label": "Web Import",
      "fields": {
        "source_url": {
          "type": "string",
          "label": "Source URL",
          "description": "Full page URL where the asset was found"
        },
        "source_site": {
          "type": "string",
          "label": "Domain",
          "description": "Website domain (e.g., twitter.com)",
          "filterable": true
        }
      }
    },
    "local": {
      "label": "Local",
      "fields": {
        "source_folder_id": {
          "type": "string",
          "label": "Source Folder",
          "description": "Local folder ID"
        },
        "source_folder": {
          "type": "string",
          "label": "Folder Name",
          "description": "Local folder display name"
        },
        "source_subfolder": {
          "type": "string",
          "label": "Subfolder",
          "description": "Subfolder name within the source folder"
        },
        "source_relative_path": {
          "type": "string",
          "label": "Source Path",
          "description": "Relative file path within the folder"
        }
      }
    },
    "video_capture": {
      "label": "Video Capture",
      "fields": {
        "source_url": {
          "type": "string",
          "label": "Source URL",
          "description": "Original video URL (if captured from web)"
        },
        "source_site": {
          "type": "string",
          "label": "Source Site",
          "description": "Website domain (e.g., twitter.com)",
          "filterable": true
        },
        "source_folder": {
          "type": "string",
          "label": "Source Folder",
          "description": "Top-level folder for local video captures"
        },
        "source_filename": {
          "type": "string",
          "label": "Source Video",
          "description": "Source video file name"
        },
        "source_asset_id": {
          "type": "number",
          "label": "Source Asset",
          "description": "Asset ID captured from the library"
        },
        "frame_time": {
          "type": "number",
          "label": "Frame Time",
          "description": "Timestamp in seconds"
        },
        "has_region": {
          "type": "boolean",
          "label": "Has Region",
          "description": "True if a crop/region was selected"
        }
      }
    },
    "mask_draw": {
      "label": "Mask Draw",
      "fields": {
        "source_asset_id": {
          "type": "number",
          "label": "Source Asset",
          "description": "Asset ID the mask was drawn on"
        },
        "mask_type": {
          "type": "string",
          "label": "Mask Type",
          "description": "Mask semantic type (e.g., inpaint)"
        }
      }
    }
  }
} as const;

export type UploadContextMethod = keyof typeof uploadContextSpec.upload_methods;
export type UploadContextFieldValue = string | number | boolean;
export type UploadContextMap = Record<string, UploadContextFieldValue>;
