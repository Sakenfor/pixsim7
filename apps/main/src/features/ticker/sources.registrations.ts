/**
 * Ticker — source registry declarations.
 *
 * Side-effect module imported eagerly at app bootstrap so all sources are
 * known before the first `<Ticker />` mounts. Matches `stores-registry-canon`.
 *
 * Add new sources by importing them and calling `registerTickerSource(...)`.
 */

import { registerTickerSource } from './lib/sourceRegistry';
import { generationsSource } from './sources/generationsSource';

registerTickerSource(generationsSource);
