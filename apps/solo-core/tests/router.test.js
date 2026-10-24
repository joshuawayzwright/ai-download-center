import test from 'node:test';
import assert from 'node:assert/strict';
import {route,validateAgentAction} from '../router.js';
test('fast chat by default',()=>assert.equal(route({text:'Hello'}).profile,'fast'));
test('coding routed to code',()=>assert.equal(route({text:'debug this code'}).profile,'code'));
test('research selects reasoning and public search',()=>assert.deepEqual(route({mode:'research',text:'Compare AI models'}).tools,['public_search']));
test('agent never runs unapproved tools',()=>{const result=route({mode:'agent',text:'send an email'});assert.equal(result.requiresApproval,true);assert.deepEqual(result.tools,[]);assert.equal(validateAgentAction({id:'send_email'},[]),false);assert.equal(validateAgentAction({id:'send_email'},['send_email']),true)});
test('reject empty input',()=>assert.throws(()=>route({text:' '})));
test('reject unknown modes',()=>assert.throws(()=>route({mode:'admin',text:'hello'})));
