import {communityOrigin} from './community-branding';

/** A fork must choose its own server; saved preferences and invitation links still win. */
export const defaultServer=communityOrigin(import.meta.env.VITE_ROOMS_DEFAULT_SERVER??'')??'';
