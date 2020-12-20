/*
CORS Anywhere as a Cloudflare Worker!
based on code by Zibri (www.zibri.org)
https://github.com/Zibri/cloudflare-cors-anywhere
*/

/*
whitelist = [ "^http.?://www.zibri.org$", "zibri.org$", "test\\..*" ];  // regexp for whitelisted urls
*/

const blacklist = [];     // regexp for blacklisted urls
const whitelist = ['.*']; // regexp for whitelisted origins

function isListed(uri, listing) {
  let ret = false;
  if (typeof uri == 'string') {
    listing.forEach((m) => {
      if (uri.match(m) != null) ret = true;
    });
  } else {
    // decide what to do when Origin is null
    ret = true; // true accepts null origins false rejects them.
  }
  return ret;
}

addEventListener('fetch', async (event) => {
  event.respondWith(
    (async function () {
      function fix(myHeaders) {
        // myHeaders.set("Access-Control-Allow-Origin", "*");
        myHeaders.set('Access-Control-Allow-Origin', event.request.headers.get('Origin'));
        if (isOPTIONS) {
          myHeaders.set(
            'Access-Control-Allow-Methods',
            event.request.headers.get('access-control-request-method')
          );
          const acrh = event.request.headers.get('access-control-request-headers');
          //myHeaders.set("Access-Control-Allow-Credentials", "true");
          if (acrh) myHeaders.set('Access-Control-Allow-Headers', acrh);
          myHeaders.delete('X-Content-Type-Options');
        }
        return myHeaders;
      }
      // get info from request
      const isOPTIONS = event.request.method == 'OPTIONS';
      const origin_url = new URL(event.request.url);
      const fetch_url = unescape(unescape(origin_url.search.substr(1)));
      const orig = event.request.headers.get('Origin');
      const remIp = event.request.headers.get('CF-Connecting-IP');
      // if allowed url
      if (!isListed(fetch_url, blacklist) && isListed(orig, whitelist)) {
        // work on cors headers
        let xheaders = event.request.headers.get('x-cors-headers');
        if (xheaders != null) {
          try {
            xheaders = JSON.parse(xheaders);
          } catch (e) {}
        }
        // if it's a fetch job
        if (origin_url.search.startsWith('?')) {
          // work on received headers
          const recv_headers = {};
          for (let pair of event.request.headers.entries()) {
            if (
              pair[0].match('^origin') == null &&
              pair[0].match('eferer') == null &&
              pair[0].match('^cf-') == null &&
              pair[0].match('^x-forw') == null &&
              pair[0].match('^x-cors-headers') == null
            )
              recv_headers[pair[0]] = pair[1];
          }
          if (xheaders != null) Object.entries(xheaders).forEach((c) => (recv_headers[c[0]] = c[1]));
          // fetch url
          const newreq = new Request(event.request, { headers: recv_headers });
          const response = await fetch(fetch_url, newreq);
          // work on fetched headers
          const allh = {};
          const cors_headers = [];
          let myHeaders = new Headers(response.headers);
          for (let pair of response.headers.entries()) {
            cors_headers.push(pair[0]);
            allh[pair[0]] = pair[1];
          }
          // set return headers
          cors_headers.push('cors-received-headers');
          myHeaders = fix(myHeaders);
          myHeaders.set('Access-Control-Expose-Headers', cors_headers.join(','));
          myHeaders.set('cors-received-headers', JSON.stringify(allh));
          // get body and return
          const body = isOPTIONS ? null : await response.arrayBuffer();
          const init = {
            headers: myHeaders,
            status: isOPTIONS ? 200 : response.status,
            statusText: isOPTIONS ? 'OK' : response.statusText,
          };
          return new Response(body, init);
        } else {
          // get and fix headers
          let myHeaders = new Headers();
          myHeaders = fix(myHeaders);
          // check country and datacenter
          let country, colo;
          if (typeof event.request.cf != 'undefined') {
            if (typeof event.request.cf.country != 'undefined') {
              country = event.request.cf.country;
            } else country = false;
            if (typeof event.request.cf.colo != 'undefined') {
              colo = event.request.cf.colo;
            } else colo = false;
          } else {
            country = false;
            colo = false;
          }
          // return 200
          return new Response(
            'CLOUDFLARE-CORS-ANYWHERE\n\n' +
              (orig != null ? 'Origin: ' + orig + '\n' : '') +
              'Ip: ' +
              remIp +
              '\n' +
              (country ? 'Country: ' + country + '\n' : '') +
              (colo ? 'Datacenter: ' + colo + '\n' : '') +
              '\n' +
              (xheaders != null ? '\nx-cors-headers: ' + JSON.stringify(xheaders) : ''),
            { status: 200, headers: myHeaders }
          );
        }
      } else {
        return new Response(
          'Create your own cors proxy</br>\n' +
            "<a href='https://github.com/Zibri/cloudflare-cors-anywhere'>https://github.com/Zibri/cloudflare-cors-anywhere</a></br>\n",
          {
            status: 403,
            statusText: 'Forbidden',
            headers: {
              'Content-Type': 'text/html',
            },
          }
        );
      }
    })()
  );
});
