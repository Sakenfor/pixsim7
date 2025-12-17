# Provider Template

This is a template for creating new providers. To use:

1. Copy this directory: `cp -r _template myprovider`
2. Rename files and update the provider_id
3. Implement the required methods in the adapter
4. Update the manifest with your provider's metadata

See `/docs/systems/generation/adding-providers.md` for full documentation.

## Files

- `manifest.py` - Provider manifest (metadata, registration)
- `adapter_template.py` - Copy to `services/provider/adapters/myprovider.py`
