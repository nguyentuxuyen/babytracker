export const formatDate = (date: Date, format: string): string => {
    const options: Intl.DateTimeFormatOptions = {};

    if (format.includes('YYYY')) options.year = 'numeric';
    if (format.includes('MM')) options.month = '2-digit';
    if (format.includes('DD')) options.day = '2-digit';

    return new Intl.DateTimeFormat('en-US', options).format(date);
};

export const calculateAgeInDays = (birthDate: Date): number => {
    const today = new Date();
    const timeDiff = today.getTime() - birthDate.getTime();
    return Math.floor(timeDiff / (1000 * 3600 * 24));
};

export const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
};