// commands/ListServersCommand.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export class ListServersCommand {
    constructor() {
        this.name = 'listservers';
        this.description = 'List all available servers and their indexes.';
    }

    getSlashCommand() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description);
    }

    getPlayerCountFromList(playerListResult) {
        if (
            !playerListResult ||
            playerListResult.trim() === '' ||
            playerListResult.includes('No Players Connected') ||
            playerListResult.startsWith('Error') // Added check for error messages
        ) {
            return 0;
        }

        const lines = playerListResult.split(/\r?\n/).filter(line => line.trim() !== '');
        return lines.length;
    }

    async execute(interaction, rconManager) {
        const fields = [];
        let totalPlayers = 0;

        for (const s of rconManager.servers) {
            let playerListResult;
            try {
                playerListResult = await rconManager.executeRconCommand(s.index, 'listplayers');
            } catch (err) {
                console.error(`Error executing 'listplayers' command on ${s.name}:`, err);
                playerListResult = `Error retrieving players: ${err.message}`;
            }

            const playerCount = this.getPlayerCountFromList(playerListResult);
            totalPlayers += playerCount;

            let fieldValue;
            if (playerListResult.startsWith('Error')) {
                // If we got an error result
                fieldValue = playerListResult;
            } else if (playerCount === 0) {
                fieldValue = 'No players online.';
            } else {
                // Show player count and list
                fieldValue = `${playerCount} ${playerCount === 1 ? 'player' : 'players'}:\n\`\`\`${playerListResult}\`\`\``;
            }

            fields.push({
                name: `Index: ${s.index} - ${s.name}`,
                value: fieldValue,
                inline: false
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('Available Servers and Current Players')
            .setColor('Red')
            .setDescription(`Total Players Across All Servers: ${totalPlayers}`)
            .addFields(fields)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: false });
    }
}