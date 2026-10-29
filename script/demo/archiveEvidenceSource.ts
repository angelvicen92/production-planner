import {execFileSync} from 'node:child_process';
import {unlinkSync} from 'node:fs';
import {join} from 'node:path';

/** Preserve git archive bytes without buffering the growing Evidence tree. */
export function archiveEvidenceSource(output:string,source:string,ref='HEAD',cwd?:string) {
 const archive=join(output,'source.tar');
 execFileSync('git',['archive','--format=tar',`--output=${archive}`,ref],{cwd});
 try {execFileSync('tar',['-x','-f',archive,'-C',source]);}
 finally {unlinkSync(archive);}
}
