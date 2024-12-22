// commands/ListServersLiveCommand.js

import {
    SlashCommandBuilder,
    EmbedBuilder
} from 'discord.js';

export class ListServersLiveCommand {
    constructor(allowedRoleID) {
        this.name = 'listserverslive';
        this.description = 'List all servers with live updates until stopped.';
        this.allowedRoleID = allowedRoleID;
        this.stopEmoji = '🛑';
        this.updateIntervalMs = 10000;
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
            playerListResult.startsWith('Error')
        ) {
            return 0;
        }

        const lines = playerListResult
            .split(/\r?\n/)
            .filter(line => line.trim() !== '');
        return lines.length;
    }

    async buildEmbed(rconManager) {
        const fields = [];
        let totalPlayers = 0;

        for (const s of rconManager.servers) {
            let playerListResult;
            try {
                playerListResult = await rconManager.executeRconCommand(
                    s.index,
                    'listplayers'
                );
            } catch (err) {
                console.error(`Error on ${s.name}:`, err);
                playerListResult = `Error retrieving players: ${err.message}`;
                if (error.message && error.message.includes('Timeout')) {
                    // Attempt a reconnect or simply skip this iteration
                    console.log(`Attempting to reconnect to ${server.name} due to timeout...`);
                    await this.rconManager.connectRCON(server);

                    // Optional: Add a short delay before next attempt if desired
                    await new Promise(res => setTimeout(res, 5000));
                }
            }

            const playerCount = this.getPlayerCountFromList(playerListResult);
            totalPlayers += playerCount;

            let fieldValue;
            if (playerListResult.startsWith('Error')) {
                fieldValue = playerListResult;
            } else if (playerCount === 0) {
                fieldValue = 'No players online.';
            } else {
                fieldValue = `${playerCount} player(s):\n\`\`\`${playerListResult}\`\`\``;
            }

            fields.push({
                name: `Index: ${s.index} - ${s.name}`,
                value: fieldValue,
                inline: false
            });
        }

        return new EmbedBuilder()
            .setTitle('Available Servers and Current Players')
            .setColor('Red')
            .setDescription(`Total Players Across All Servers: ${totalPlayers}`)
            .addFields(fields)
            .setTimestamp();
    }

    async execute(interaction, rconManager, client) {
        await interaction.deferReply({ ephemeral: false });
        const embed = await this.buildEmbed(rconManager);
        const message = await interaction.followUp({
            embeds: [embed],
            fetchReply: true
        });

        // React with the stop emoji
        try {
            await message.react(this.stopEmoji);
        } catch (err) {
            console.error('Error reacting with stop emoji:', err);
            return;
        }

        // Create reaction collector
        const filter = async (reaction, user) => {
            // Safely log the user
            console.log(
                'Reaction detected:',
                reaction.emoji.name,
                'User:',
                user?.tag // Use optional chaining to avoid crashing
            );

            // If user is undefined, bail out to avoid crash
            if (!user) {
                return false;
            }

            // Ignore if the reaction is not the stop emoji
            if (reaction.emoji.name !== this.stopEmoji) return false;

            // Ignore bot's own reaction
            if (user.id === client) return false;

            // Possibly fetch member if not cached
            let member = message.guild?.members.cache.get(user.id);
            if (!member) {
                try {
                    member = await message.guild?.members.fetch(user.id);
                } catch (err) {
                    console.error('Error fetching member:', err);
                    return false;
                }
            }

            // Check if user has the allowed role
            return member?.roles.cache.has(this.allowedRoleID);
        };

        // If you do NOT need reaction-remove events, remove `dispose: true`
        const collector = message.createReactionCollector({ filter, dispose: true });
        let updateInterval;

        const stopUpdating = () => {
            if (updateInterval) {
                clearInterval(updateInterval);
                updateInterval = null;
            }
            collector.stop();
        };

        // If an authorized user reacts, stop and delete message
        collector.on('collect', async (reaction, user) => {
            console.log(`Stopping auto-update because ${user?.tag} reacted.`);
            stopUpdating();
            try {
                await message.delete();
                console.log('Message deleted successfully.');
            } catch (err) {
                console.error('Error deleting message:', err);
            }
        });

        // Also stop if the collector ends for any other reason
        collector.on('end', (collected, reason) => {
            console.log(`Reaction collector ended. Reason: ${reason}`);
            stopUpdating();
        });

        // Keep updating
        updateInterval = setInterval(async () => {
            try {
                const updatedEmbed = await this.buildEmbed(rconManager);
                await message.edit({ embeds: [updatedEmbed] });
            } catch (err) {
                console.error('Error updating embed:', err);
            }
        }, this.updateIntervalMs);
    }
}