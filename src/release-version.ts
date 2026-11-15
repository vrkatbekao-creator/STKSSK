import {version} from '../package.json';

export const releaseVersion=`v${version.replace(/-beta\.(\d+)$/,' Beta $1')}`;
