import Heap from '@liqd-js/heap';
//import ApplicationStatus from '@liqd-rn/app-state';

type TimerOptions = 
{
    offset?  : number
    expires? : Date | number
    data?    : any
}

type TimerEntry = 
{
    id          : string
    deadline    : number | Date
    expires?    : number | Date
    callback    : ( data: any ) => void
    data        : any
}

type TimerCallback = ( data: any ) => void;

const MAX_TIMEOUT_MS = 365 * 24 * 60 * 60 * 1000;
//const ApplicationStatusChanged = Symbol('ApplicationStatusChanged');

const timestamp = ( time: Date | number ) => time instanceof Date ? time.getTime() : time;
const normalize = ( time: Date | number, offset: number = 0 ) => 
{
    if( typeof time === 'number' )
    {
        time = ( time < MAX_TIMEOUT_MS ? Date.now() + time : time ) + offset;
    }
    else // time instanceof Date
    {
        try
        {
            //@ts-ignore
            time = new time.constructor( time ) as Date;
        }
        catch( e )
        {
            time = new Date( time.toISOString() );
        }
        
        offset && time.setMilliseconds( time.getMilliseconds() + offset );
    }

    return time;
}

export default class Timer
{
    /* STATIC */

    private static instances = new Set<Timer>();
    private static index = new Map<string, Timer>();
    private static global: Timer | undefined;
    private static active = true;

    public static id( prefix: string = '' ): string
    {
        return prefix + (( Date.now() % 137438953472 ) * 65536 + Math.floor( Math.random() * 65536 ));
    }

    public static $( name: string )
    {
        let instance = Timer.index.get( name );

        if( !instance )
        {
            Timer.index.set( name, instance = new Timer());
        }

        return instance;
    }

    public static get Global()
    {
        return Timer.global ?? ( Timer.global = new Timer());
    }

    /*public static [ApplicationStatusChanged]( status: typeof ApplicationStatus.current )
    {
        Timer.active = status !== 'background';

        for( let instance of Timer.instances )
        {
            instance.schedule();
        }
    }*/

    /* INSTANCE */

    private paused: boolean = false;
    private timeout: number | undefined;
    private index = new Map<string, TimerEntry>();
    private heap = new Heap<TimerEntry, string>(( a, b ) => timestamp( a.deadline ) - timestamp( b.deadline ), i => i.id );

    public constructor()
    {
        Timer.instances.add( this );

        this.timeout = setTimeout(() => 1, 0 );
    }

    private schedule()
    {
        this.timeout && clearTimeout( this.timeout );
        this.timeout = Timer.active && !this.paused && this.heap.top() ? setTimeout(() => this.dispatch(), Math.max( 0, Math.min( 900000, timestamp( this.heap.top()!.deadline ) - Date.now()))) : undefined;
    }

    private dispatch()
    {
        this.timeout = undefined;

		let top, now = Date.now();

		while(( top = this.heap.top() ) && ( timestamp( top.deadline ) <= now + 16 ))
		{
			let timer = this.heap.pop()!;
		    this.index.delete( timer.id );

            ( !timer.expires || timestamp( timer.expires ) >= now - 100 ) && timer.callback( timer.data );
		}

		this.schedule();
    }

    public id( prefix: string = '' ): string
    {
        return Timer.id( prefix );
    }

    public set( id: string, callback: TimerCallback, deadline: Date | number, options: TimerOptions = {})
	{   
        let timer = this.index.get( id ), expires = options.expires ? normalize( options.expires ) : undefined;
    
        if( timer )
		{
			timer.deadline = normalize( deadline, options.offset );;
            timer.expires = expires;
			timer.callback = callback;
			timer.data = options.data;
			this.heap.update( timer );
		}
		else
		{
			this.index.set( id, timer = { id, deadline: normalize( deadline, options.offset ), expires, callback, data: options.data });
			this.heap.push( timer );
		}

		this.schedule();
	}

    public postpone( id: string, deadline: Date | number, options: Omit<TimerOptions, 'data'> = {}): boolean
	{
		const timer = this.index.get( id ), expires = options.expires ? normalize( options.expires ) : timer?.expires;

		if( timer )
		{
			timer.deadline = normalize( deadline, options.offset );
            timer.expires = expires;
			this.heap.update( timer );

            this.schedule();
		}
		
        return !!timer;
	}

    public unset( id: string ): boolean
    {
        const timer = this.index.get( id );

        if( timer )
        {
            this.index.delete( id );
            this.heap.delete( timer );

            this.schedule();
        }

        return !!timer;
    }

    public clear()
    {
        this.index.clear();
        this.heap.clear();

        this.schedule();
    }

    public pause()
    {
        this.paused = true;

        this.schedule();
    }

    public resume()
    {
        this.paused = false;

        this.schedule();
    }

    public destroy()
    {
        this.clear(); //TODO set destroyed flag and throw error if schedule is called

        Timer.instances.delete( this );
    }
}

//ApplicationStatus.listen( Timer[ApplicationStatusChanged] );