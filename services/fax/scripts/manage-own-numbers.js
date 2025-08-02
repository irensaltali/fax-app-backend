/**
 * Script to manage own numbers table
 * Usage: node manage-own-numbers.js [add|remove|list] [phone_number] [description]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addOwnNumber(phoneNumber, description = '') {
	try {
		const { data, error } = await supabase
			.from('own_numbers')
			.insert({
				phone_number: phoneNumber,
				description: description
			})
			.select()
			.single();

		if (error) {
			console.error('Error adding own number:', error.message);
			return false;
		}

		console.log('Successfully added own number:', data);
		return true;
	} catch (error) {
		console.error('Error adding own number:', error.message);
		return false;
	}
}

async function removeOwnNumber(phoneNumber) {
	try {
		const { data, error } = await supabase
			.from('own_numbers')
			.delete()
			.eq('phone_number', phoneNumber)
			.select()
			.single();

		if (error) {
			console.error('Error removing own number:', error.message);
			return false;
		}

		console.log('Successfully removed own number:', data);
		return true;
	} catch (error) {
		console.error('Error removing own number:', error.message);
		return false;
	}
}

async function listOwnNumbers() {
	try {
		const { data, error } = await supabase
			.from('own_numbers')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error listing own numbers:', error.message);
			return false;
		}

		console.log('Own numbers:');
		if (data.length === 0) {
			console.log('No own numbers found.');
		} else {
			data.forEach(number => {
				console.log(`- ${number.phone_number} (${number.is_active ? 'Active' : 'Inactive'}) - ${number.description || 'No description'}`);
			});
		}
		return true;
	} catch (error) {
		console.error('Error listing own numbers:', error.message);
		return false;
	}
}

async function main() {
	const command = process.argv[2];
	const phoneNumber = process.argv[3];
	const description = process.argv[4];

	if (!command) {
		console.log('Usage: node manage-own-numbers.js [add|remove|list] [phone_number] [description]');
		console.log('');
		console.log('Commands:');
		console.log('  add <phone_number> [description]  - Add a new own number');
		console.log('  remove <phone_number>             - Remove an own number');
		console.log('  list                              - List all own numbers');
		return;
	}

	switch (command) {
		case 'add':
			if (!phoneNumber) {
				console.error('Phone number is required for add command');
				return;
			}
			await addOwnNumber(phoneNumber, description);
			break;

		case 'remove':
			if (!phoneNumber) {
				console.error('Phone number is required for remove command');
				return;
			}
			await removeOwnNumber(phoneNumber);
			break;

		case 'list':
			await listOwnNumbers();
			break;

		default:
			console.error('Unknown command:', command);
			console.log('Available commands: add, remove, list');
			break;
	}
}

main().catch(console.error); 
