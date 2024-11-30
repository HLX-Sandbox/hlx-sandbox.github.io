const fragment = new URLSearchParams(window.location.hash.slice(1));
const [accessToken, tokenType] = [fragment.get('access_token'), fragment.get('token_type')];
document.cookie = `auth=${tokenType} ${accessToken}; expires=${new Date(Date.now() + 30*24*60*60*1000).toUTCString()}; path=/`
window.location.href = "/editor"