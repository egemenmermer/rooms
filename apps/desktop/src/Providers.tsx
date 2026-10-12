import { PersonalMedia } from './PersonalMedia';
/** Settings entry shares the real personal-media UI and native provider bridge. */
export function PersonalProviders({ notify }: { notify(message: string): void }) {
    return <PersonalMedia notify={notify} embedded/>;
}
