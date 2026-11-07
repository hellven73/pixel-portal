import {commands} from './discord-bot.mjs';
import {pathToFileURL} from 'node:url';
export async function registerCommands({applicationId:app,guildId:guild,token,fetcher=fetch}){
 if(!/^\d{16,22}$/.test(app||'')||!/^\d{16,22}$/.test(guild||'')||!token)throw Error('Discord application, server and bot token must be configured.');
 for(const definition of commands){const {contexts,integration_types,...command}=definition;const r=await fetcher(`https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`,{method:'POST',headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`Could not register /${command.name}: HTTP ${r.status}`)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const{DISCORD_APPLICATION_ID:applicationId,DISCORD_GUILD_ID:guildId,DISCORD_BOT_TOKEN:token}=process.env;await registerCommands({applicationId,guildId,token});console.log('Discord commands registered.');console.log(`Install: https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot%20applications.commands&permissions=19472&guild_id=${guildId}&disable_guild_select=true`)}
