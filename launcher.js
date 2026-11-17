import { spawn } from "node:child_process";
const jobs = [
  ["dashboard", ["dashboard-server.js"]],
  ["whatsapp-bot", ["Perangkat_Keras/Power_suply.js", "--pairing"]]
];
const children = jobs.map(([name,args]) => {
  const child = spawn(process.execPath,args,{stdio:"inherit",env:{...process.env,BOT_ID:process.env.BOT_ID||"primary"}});
  child.on("exit",(code,signal)=>console.error(`[${name}] berhenti`,{code,signal}));
  return child;
});
const stop=()=>{for(const c of children)if(!c.killed)c.kill("SIGTERM");};
process.on("SIGTERM",stop);process.on("SIGINT",stop);
