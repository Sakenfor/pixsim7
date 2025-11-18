/**
 * Plugin Sandbox System
 *
 * Provides isolated execution environment for user plugins using iframes and postMessage.
 * Ensures plugins cannot access the parent window or make unauthorized API calls.
 */

import type { Plugin, PluginAPI, PluginManifest } from './types';

/**
 * RPC message types for iframe communication
 */
type RPCRequest = {
  id: number;
  type: 'call';
  method: string;
  args: any[];
};

type RPCResponse = {
  id: number;
  type: 'return' | 'error';
  value?: any;
  error?: string;
};

type RPCNotification = {
  type: 'notification';
  event: string;
  data: any;
};

type RPCMessage = RPCRequest | RPCResponse | RPCNotification;

/**
 * Sandboxed plugin instance running in an iframe
 */
export class SandboxedPlugin implements Plugin {
  private iframe: HTMLIFrameElement;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private pluginId: string;
  private manifest: PluginManifest;
  private api: PluginAPI;

  constructor(pluginId: string, manifest: PluginManifest, code: string, api: PluginAPI) {
    this.pluginId = pluginId;
    this.manifest = manifest;
    this.api = api;

    // Create isolated iframe
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    this.iframe.style.display = 'none';
    document.body.appendChild(this.iframe);

    // Setup message handler
    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener('message', this.messageHandler);

    // Inject plugin code
    this.injectPluginCode(code);
  }

  /**
   * Inject plugin code into iframe
   */
  private injectPluginCode(code: string): void {
    const sandboxScript = this.createSandboxScript(code);

    const iframeDoc = this.iframe.contentDocument;
    if (!iframeDoc) {
      throw new Error('Failed to access iframe document');
    }

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Plugin: ${this.manifest.name}</title>
        </head>
        <body>
          <script>${sandboxScript}</script>
        </body>
      </html>
    `);
    iframeDoc.close();
  }

  /**
   * Create sandbox script that sets up RPC bridge and loads plugin code
   */
  private createSandboxScript(pluginCode: string): string {
    return `
      (function() {
        'use strict';

        // RPC bridge for communicating with parent
        let nextRequestId = 1;
        const pendingRequests = new Map();

        // Call parent API method
        function callParent(method, args) {
          return new Promise((resolve, reject) => {
            const id = nextRequestId++;
            pendingRequests.set(id, { resolve, reject });

            window.parent.postMessage({
              id,
              type: 'call',
              method,
              args
            }, '*');

            // Timeout after 30 seconds
            setTimeout(() => {
              if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error('RPC call timeout'));
              }
            }, 30000);
          });
        }

        // Handle messages from parent
        window.addEventListener('message', (event) => {
          const msg = event.data;

          if (msg.type === 'return' || msg.type === 'error') {
            const pending = pendingRequests.get(msg.id);
            if (pending) {
              pendingRequests.delete(msg.id);
              if (msg.type === 'return') {
                pending.resolve(msg.value);
              } else {
                pending.reject(new Error(msg.error));
              }
            }
          } else if (msg.type === 'notification') {
            // Handle notifications from parent (e.g., state updates)
            if (msg.event === 'stateUpdate' && window.pluginInstance?._handleStateUpdate) {
              window.pluginInstance._handleStateUpdate(msg.data);
            } else if (msg.event === 'disable' && window.pluginInstance?.onDisable) {
              window.pluginInstance.onDisable();
            } else if (msg.event === 'uninstall' && window.pluginInstance?.onUninstall) {
              window.pluginInstance.onUninstall();
            }
          }
        });

        // Create safe API proxy
        const api = {
          getPluginId: () => callParent('getPluginId', []),
          getManifest: () => callParent('getManifest', []),

          state: {
            getGameState: () => callParent('state.getGameState', []),
            subscribe: (callback) => {
              // Store callback for state updates
              if (!window.pluginInstance) {
                window.pluginInstance = {};
              }
              window.pluginInstance._stateCallback = callback;
              window.pluginInstance._handleStateUpdate = (state) => {
                if (window.pluginInstance._stateCallback) {
                  window.pluginInstance._stateCallback(state);
                }
              };

              // Call parent to register subscription
              callParent('state.subscribe', []);

              // Return unsubscribe function
              return () => {
                window.pluginInstance._stateCallback = null;
                callParent('state.unsubscribe', []);
              };
            }
          },

          ui: {
            addOverlay: (overlay) => {
              // Extract render function as string
              const renderStr = overlay.render ? overlay.render.toString() : null;
              callParent('ui.addOverlay', [{
                ...overlay,
                render: renderStr
              }]);
            },
            removeOverlay: (id) => callParent('ui.removeOverlay', [id]),
            addMenuItem: (item) => {
              // Extract onClick as string
              const onClickStr = item.onClick ? item.onClick.toString() : null;
              callParent('ui.addMenuItem', [{
                ...item,
                onClick: onClickStr
              }]);
            },
            removeMenuItem: (id) => callParent('ui.removeMenuItem', [id]),
            showNotification: (notification) => callParent('ui.showNotification', [notification]),
            updateTheme: (css) => callParent('ui.updateTheme', [css])
          },

          storage: {
            get: (key, defaultValue) => callParent('storage.get', [key, defaultValue]),
            set: (key, value) => callParent('storage.set', [key, value]),
            remove: (key) => callParent('storage.remove', [key]),
            clear: () => callParent('storage.clear', [])
          },

          onDisable: (callback) => {
            if (!window.pluginInstance) {
              window.pluginInstance = {};
            }
            window.pluginInstance.onDisable = callback;
          },

          onUninstall: (callback) => {
            if (!window.pluginInstance) {
              window.pluginInstance = {};
            }
            window.pluginInstance.onUninstall = callback;
          }
        };

        // Load plugin code
        try {
          ${pluginCode}

          // Plugin code should define a global 'plugin' object
          if (typeof plugin === 'undefined') {
            throw new Error('Plugin must define a global "plugin" object');
          }

          // Store plugin instance
          window.pluginInstance = plugin;

          // Call onEnable
          if (plugin.onEnable) {
            Promise.resolve(plugin.onEnable(api)).then(() => {
              window.parent.postMessage({ type: 'pluginReady' }, '*');
            }).catch((error) => {
              window.parent.postMessage({
                type: 'pluginError',
                error: String(error?.message ?? error)
              }, '*');
            });
          } else {
            window.parent.postMessage({ type: 'pluginReady' }, '*');
          }
        } catch (error) {
          window.parent.postMessage({
            type: 'pluginError',
            error: String(error?.message ?? error)
          }, '*');
        }
      })();
    `;
  }

  /**
   * Handle messages from iframe
   */
  private handleMessage(event: MessageEvent): void {
    // Only accept messages from our iframe
    if (event.source !== this.iframe.contentWindow) {
      return;
    }

    const msg: RPCMessage = event.data;

    if (msg.type === 'call') {
      // Handle RPC call from plugin
      this.handleRPCCall(msg as RPCRequest);
    } else if (msg.type === 'pluginReady') {
      // Plugin initialization complete
      console.info(`Plugin ${this.pluginId} ready`);
    } else if (msg.type === 'pluginError') {
      console.error(`Plugin ${this.pluginId} error:`, (msg as any).error);
    }
  }

  /**
   * Handle RPC call from plugin
   */
  private async handleRPCCall(request: RPCRequest): Promise<void> {
    try {
      const result = await this.executeAPICall(request.method, request.args);
      this.sendResponse(request.id, result);
    } catch (error: any) {
      this.sendError(request.id, String(error?.message ?? error));
    }
  }

  /**
   * Execute API call on behalf of plugin
   */
  private async executeAPICall(method: string, args: any[]): Promise<any> {
    const parts = method.split('.');

    if (parts[0] === 'getPluginId') {
      return this.api.getPluginId();
    } else if (parts[0] === 'getManifest') {
      return this.api.getManifest();
    } else if (parts[0] === 'state') {
      if (parts[1] === 'getGameState') {
        return this.api.state.getGameState();
      } else if (parts[1] === 'subscribe') {
        // Register subscription (actual callback handling is in parent)
        return this.api.state.subscribe((state) => {
          this.sendNotification('stateUpdate', state);
        });
      } else if (parts[1] === 'unsubscribe') {
        // Handled by parent's unsubscribe return
        return;
      }
    } else if (parts[0] === 'ui') {
      if (parts[1] === 'addOverlay') {
        const overlay = args[0];
        // Convert render string back to function
        if (overlay.render && typeof overlay.render === 'string') {
          // Store original render string for later use
          const renderStr = overlay.render;
          overlay.render = () => {
            // Return placeholder - actual rendering handled by parent
            return null;
          };
          overlay._renderStr = renderStr;
        }
        return this.api.ui.addOverlay(overlay);
      } else if (parts[1] === 'removeOverlay') {
        return this.api.ui.removeOverlay(args[0]);
      } else if (parts[1] === 'addMenuItem') {
        const item = args[0];
        // Convert onClick string back to function
        if (item.onClick && typeof item.onClick === 'string') {
          const onClickStr = item.onClick;
          item.onClick = () => {
            // Send message to iframe to execute onClick
            this.sendNotification('menuItemClick', { itemId: item.id });
          };
          item._onClickStr = onClickStr;
        }
        return this.api.ui.addMenuItem(item);
      } else if (parts[1] === 'removeMenuItem') {
        return this.api.ui.removeMenuItem(args[0]);
      } else if (parts[1] === 'showNotification') {
        return this.api.ui.showNotification(args[0]);
      } else if (parts[1] === 'updateTheme') {
        return this.api.ui.updateTheme(args[0]);
      }
    } else if (parts[0] === 'storage') {
      if (parts[1] === 'get') {
        return this.api.storage.get(args[0], args[1]);
      } else if (parts[1] === 'set') {
        return this.api.storage.set(args[0], args[1]);
      } else if (parts[1] === 'remove') {
        return this.api.storage.remove(args[0]);
      } else if (parts[1] === 'clear') {
        return this.api.storage.clear();
      }
    }

    throw new Error(`Unknown API method: ${method}`);
  }

  /**
   * Send RPC response to iframe
   */
  private sendResponse(id: number, value: any): void {
    if (!this.iframe.contentWindow) return;

    this.iframe.contentWindow.postMessage({
      id,
      type: 'return',
      value
    } as RPCResponse, '*');
  }

  /**
   * Send RPC error to iframe
   */
  private sendError(id: number, error: string): void {
    if (!this.iframe.contentWindow) return;

    this.iframe.contentWindow.postMessage({
      id,
      type: 'error',
      error
    } as RPCResponse, '*');
  }

  /**
   * Send notification to iframe
   */
  private sendNotification(event: string, data: any): void {
    if (!this.iframe.contentWindow) return;

    this.iframe.contentWindow.postMessage({
      type: 'notification',
      event,
      data
    } as RPCNotification, '*');
  }

  /**
   * Plugin lifecycle: onEnable (handled in constructor)
   */
  async onEnable(api: PluginAPI): Promise<void> {
    // Already handled in constructor
  }

  /**
   * Plugin lifecycle: onDisable
   */
  async onDisable(): Promise<void> {
    // Notify iframe
    this.sendNotification('disable', null);
  }

  /**
   * Plugin lifecycle: onUninstall
   */
  async onUninstall(): Promise<void> {
    // Notify iframe
    this.sendNotification('uninstall', null);
  }

  /**
   * Cleanup sandbox
   */
  destroy(): void {
    // Remove message handler
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    // Remove iframe
    if (this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }

    // Clear pending requests
    this.pendingRequests.clear();
  }
}

/**
 * Load plugin code in sandbox
 */
export async function loadPluginInSandbox(
  pluginId: string,
  manifest: PluginManifest,
  code: string,
  api: PluginAPI
): Promise<Plugin> {
  return new Promise((resolve, reject) => {
    try {
      const plugin = new SandboxedPlugin(pluginId, manifest, code, api);

      // Wait for plugin ready or error
      const timeout = setTimeout(() => {
        reject(new Error('Plugin initialization timeout'));
      }, 10000);

      const messageHandler = (event: MessageEvent) => {
        if (event.source !== (plugin as any).iframe.contentWindow) return;

        if (event.data.type === 'pluginReady') {
          clearTimeout(timeout);
          window.removeEventListener('message', messageHandler);
          resolve(plugin);
        } else if (event.data.type === 'pluginError') {
          clearTimeout(timeout);
          window.removeEventListener('message', messageHandler);
          reject(new Error(event.data.error));
        }
      };

      window.addEventListener('message', messageHandler);
    } catch (error) {
      reject(error);
    }
  });
}
