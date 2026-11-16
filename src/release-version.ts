import {version} from '../package.json';

export const releaseVersion=`v${version.replace(/-beta\.(\d+)$/,(_match,beta:string)=>` Beta ${beta.padStart(2,'0')}`)}`;
