import { renderTemplateFromFileSync } from '../src/backends/traefik/templateParser';
import { XMagicProxyData } from '../src/types/xmagic';

const data: XMagicProxyData = { target: 'http://10.0.0.1', hostname: 'example.com' };

const out = renderTemplateFromFileSync('./config/template-example.yml', 'mysite', data);
console.log(out);
